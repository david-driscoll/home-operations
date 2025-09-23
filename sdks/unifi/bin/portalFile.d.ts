import * as pulumi from "@pulumi/pulumi";
export declare class PortalFile extends pulumi.CustomResource {
    /**
     * Get an existing PortalFile resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PortalFileState, opts?: pulumi.CustomResourceOptions): PortalFile;
    /**
     * Returns true if the given object is an instance of PortalFile.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PortalFile;
    /**
     * MIME type of the file.
     */
    readonly contentType: pulumi.Output<string>;
    /**
     * Path to the file on the local filesystem to upload to the UniFi controller. The file must exist and be readable.
     */
    readonly filePath: pulumi.Output<string>;
    /**
     * Size of the file in bytes.
     */
    readonly fileSize: pulumi.Output<number>;
    /**
     * Name of the file as stored in the UniFi controller.
     */
    readonly filename: pulumi.Output<string>;
    /**
     * Timestamp when the file was last modified.
     */
    readonly lastModified: pulumi.Output<number>;
    /**
     * MD5 hash of the file content.
     */
    readonly md5: pulumi.Output<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * URL where the file can be accessed on the UniFi controller.
     */
    readonly url: pulumi.Output<string>;
    /**
     * Create a PortalFile resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: PortalFileArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PortalFile resources.
 */
export interface PortalFileState {
    /**
     * MIME type of the file.
     */
    contentType?: pulumi.Input<string>;
    /**
     * Path to the file on the local filesystem to upload to the UniFi controller. The file must exist and be readable.
     */
    filePath?: pulumi.Input<string>;
    /**
     * Size of the file in bytes.
     */
    fileSize?: pulumi.Input<number>;
    /**
     * Name of the file as stored in the UniFi controller.
     */
    filename?: pulumi.Input<string>;
    /**
     * Timestamp when the file was last modified.
     */
    lastModified?: pulumi.Input<number>;
    /**
     * MD5 hash of the file content.
     */
    md5?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * URL where the file can be accessed on the UniFi controller.
     */
    url?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PortalFile resource.
 */
export interface PortalFileArgs {
    /**
     * Path to the file on the local filesystem to upload to the UniFi controller. The file must exist and be readable.
     */
    filePath: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}
