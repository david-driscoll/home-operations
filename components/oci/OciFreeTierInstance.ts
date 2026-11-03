import * as oci from "@pulumi/oci";
import { all, ComponentResource, type ComponentResourceOptions, type Input, type Output, output } from "@pulumi/pulumi";
import { assertFreeTier, FREE_TIER } from "./freeTier.ts";

export interface OciFreeTierInstanceArgs {
  compartmentId: Input<string>;
  availabilityDomain: Input<string>;
  subnetId: Input<string>;
  nsgIds: Input<string>[];
  /** The provider's region. Checked against the home region before anything is created. */
  region: Output<string>;
  /** Defaults to the whole A1 allowance. Plain numbers so the guard runs at program time. */
  ocpus?: number;
  memoryInGbs?: number;
  bootVolumeSizeInGbs?: number;
  /** cloud-init. Day-0 only: OCI cannot change user_data after launch, so later edits are ignored. */
  userData: Input<string>;
  sshAuthorizedKeys: Input<string>;
  hostname: string;
  provider: oci.Provider;
}

/**
 * One Always Free Ampere A1 VM on Ubuntu 24.04 aarch64, plus a RESERVED public
 * IP that survives the VM being replaced or reclaimed.
 *
 * The free-tier guard runs before any resource is registered, so a request
 * outside the allowance fails `pulumi preview` instead of reaching OCI.
 */
export class OciFreeTierInstance extends ComponentResource {
  public readonly instance: oci.core.Instance;
  public readonly publicIp: oci.core.PublicIp;
  public readonly publicIpAddress: Output<string>;
  public readonly privateIpAddress: Output<string>;

  constructor(name: string, args: OciFreeTierInstanceArgs, opts?: ComponentResourceOptions) {
    super("custom:oci:FreeTierInstance", name, {}, opts);

    const ocpus = args.ocpus ?? FREE_TIER.a1Ocpus;
    const memoryInGbs = args.memoryInGbs ?? FREE_TIER.a1MemoryGb;
    // 100 of the 200 GB, so a replacement can coexist with a preserved volume.
    const bootVolumeSizeInGbs = args.bootVolumeSizeInGbs ?? 100;
    const request = { shape: FREE_TIER.a1Shape, ocpus, memoryInGbs, bootVolumeSizeInGbs };
    assertFreeTier({ ...request, region: FREE_TIER.homeRegion });
    // The region comes from the API-key secret, so it is only known once
    // resolved; failing here still stops the update before the instance.
    const region = args.region.apply(r => {
      assertFreeTier({ ...request, region: r });
      return r;
    });

    const cro = { parent: this, provider: args.provider };
    const image = oci.core.getImagesOutput(
      {
        compartmentId: args.compartmentId,
        operatingSystem: "Canonical Ubuntu",
        operatingSystemVersion: "24.04",
        shape: FREE_TIER.a1Shape,
        sortBy: "TIMECREATED",
        sortOrder: "DESC",
      },
      cro,
    );

    this.instance = new oci.core.Instance(
      name,
      {
        compartmentId: args.compartmentId,
        availabilityDomain: args.availabilityDomain,
        displayName: args.hostname,
        shape: FREE_TIER.a1Shape,
        shapeConfig: { ocpus, memoryInGbs },
        sourceDetails: {
          sourceType: "image",
          // Gated on `region`, so a non-home region fails the update here.
          sourceId: all([image.images, region]).apply(([images]) => {
            if (images.length === 0) throw new Error("No Ubuntu 24.04 aarch64 image for VM.Standard.A1.Flex");
            return images[0].id;
          }),
          bootVolumeSizeInGbs: `${bootVolumeSizeInGbs}`,
        },
        // No ephemeral IP: a reserved one is attached below, and OCI refuses to
        // assign it to a private IP that already has a public one.
        createVnicDetails: {
          subnetId: args.subnetId,
          assignPublicIp: "false",
          nsgIds: args.nsgIds,
          hostnameLabel: args.hostname,
        },
        metadata: {
          ssh_authorized_keys: args.sshAuthorizedKeys,
          user_data: output(args.userData).apply(u => Buffer.from(u).toString("base64")),
        },
        // Memory metrics are what idle reclamation is judged on, and they come
        // from this plugin; Bastion is the second admin path after Tailscale.
        agentConfig: {
          pluginsConfigs: [
            { name: "Compute Instance Monitoring", desiredState: "ENABLED" },
            { name: "Bastion", desiredState: "ENABLED" },
          ],
        },
        instanceOptions: { areLegacyImdsEndpointsDisabled: true },
        availabilityConfig: { recoveryAction: "RESTORE_INSTANCE" },
        // A preserved volume would keep counting against the 200 GB.
        preserveBootVolume: false,
        freeformTags: { "managed-by": "pulumi" },
      },
      {
        ...cro,
        // Create-before-delete would briefly run two A1 VMs: over the allowance.
        deleteBeforeReplace: true,
        // A newer image every few weeks would otherwise replace the VM, and
        // OCI cannot apply user_data/ssh key changes after launch anyway.
        ignoreChanges: ["sourceDetails.sourceId", "metadata"],
      },
    );

    const vnic = oci.core.getVnicAttachmentsOutput({ compartmentId: args.compartmentId, instanceId: this.instance.id }, cro);
    const privateIp = oci.core.getPrivateIpsOutput({ vnicId: vnic.vnicAttachments.apply(a => a[0].vnicId) }, cro);

    this.publicIp = new oci.core.PublicIp(
      `${name}-public`,
      {
        compartmentId: args.compartmentId,
        displayName: `${args.hostname}-public`,
        lifetime: "RESERVED",
        privateIpId: privateIp.privateIps.apply(ips => ips[0].id),
      },
      // The address is what DNS points at; losing it means re-pointing every
      // client, so it is never deleted by accident. Replacement only re-attaches.
      { ...cro, protect: true },
    );
    this.publicIpAddress = this.publicIp.ipAddress;
    this.privateIpAddress = this.instance.privateIp;

    this.registerOutputs({ publicIpAddress: this.publicIpAddress, privateIpAddress: this.privateIpAddress });
  }
}
