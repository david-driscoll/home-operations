import * as pulumi from "@pulumi/pulumi";
export declare class SourceLdap extends pulumi.CustomResource {
    /**
     * Get an existing SourceLdap resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SourceLdapState, opts?: pulumi.CustomResourceOptions): SourceLdap;
    /**
     * Returns true if the given object is an instance of SourceLdap.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SourceLdap;
    /**
     * Defaults to ``.
     */
    readonly additionalGroupDn: pulumi.Output<string | undefined>;
    /**
     * Defaults to ``.
     */
    readonly additionalUserDn: pulumi.Output<string | undefined>;
    readonly baseDn: pulumi.Output<string>;
    readonly bindCn: pulumi.Output<string>;
    readonly bindPassword: pulumi.Output<string>;
    /**
     * Defaults to `false`.
     */
    readonly deleteNotFoundObjects: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly enabled: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `member`.
     */
    readonly groupMembershipField: pulumi.Output<string | undefined>;
    /**
     * Defaults to `(objectClass=group)`.
     */
    readonly groupObjectFilter: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly lookupGroupsFromUser: pulumi.Output<boolean | undefined>;
    readonly name: pulumi.Output<string>;
    /**
     * Defaults to `objectSid`.
     */
    readonly objectUniquenessField: pulumi.Output<string | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly passwordLoginUpdateInternalPassword: pulumi.Output<boolean | undefined>;
    readonly propertyMappings: pulumi.Output<string[] | undefined>;
    readonly propertyMappingsGroups: pulumi.Output<string[] | undefined>;
    readonly serverUri: pulumi.Output<string>;
    readonly slug: pulumi.Output<string>;
    /**
     * Defaults to `false`.
     */
    readonly sni: pulumi.Output<boolean | undefined>;
    readonly sourceLdapId: pulumi.Output<string>;
    /**
     * Defaults to `true`.
     */
    readonly startTls: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly syncGroups: pulumi.Output<boolean | undefined>;
    readonly syncParentGroup: pulumi.Output<string | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly syncUsers: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `true`.
     */
    readonly syncUsersPassword: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `distinguishedName`.
     */
    readonly userMembershipAttribute: pulumi.Output<string | undefined>;
    /**
     * Defaults to `(objectClass=person)`.
     */
    readonly userObjectFilter: pulumi.Output<string | undefined>;
    /**
     * Defaults to `goauthentik.io/sources/%(slug)s`.
     */
    readonly userPathTemplate: pulumi.Output<string | undefined>;
    /**
     * Generated.
     */
    readonly uuid: pulumi.Output<string>;
    /**
     * Create a SourceLdap resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SourceLdapArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SourceLdap resources.
 */
export interface SourceLdapState {
    /**
     * Defaults to ``.
     */
    additionalGroupDn?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    additionalUserDn?: pulumi.Input<string>;
    baseDn?: pulumi.Input<string>;
    bindCn?: pulumi.Input<string>;
    bindPassword?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    deleteNotFoundObjects?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Defaults to `member`.
     */
    groupMembershipField?: pulumi.Input<string>;
    /**
     * Defaults to `(objectClass=group)`.
     */
    groupObjectFilter?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    lookupGroupsFromUser?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    /**
     * Defaults to `objectSid`.
     */
    objectUniquenessField?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    passwordLoginUpdateInternalPassword?: pulumi.Input<boolean>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[]>;
    serverUri?: pulumi.Input<string>;
    slug?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    sni?: pulumi.Input<boolean>;
    sourceLdapId?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    startTls?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    syncGroups?: pulumi.Input<boolean>;
    syncParentGroup?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    syncUsers?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    syncUsersPassword?: pulumi.Input<boolean>;
    /**
     * Defaults to `distinguishedName`.
     */
    userMembershipAttribute?: pulumi.Input<string>;
    /**
     * Defaults to `(objectClass=person)`.
     */
    userObjectFilter?: pulumi.Input<string>;
    /**
     * Defaults to `goauthentik.io/sources/%(slug)s`.
     */
    userPathTemplate?: pulumi.Input<string>;
    /**
     * Generated.
     */
    uuid?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a SourceLdap resource.
 */
export interface SourceLdapArgs {
    /**
     * Defaults to ``.
     */
    additionalGroupDn?: pulumi.Input<string>;
    /**
     * Defaults to ``.
     */
    additionalUserDn?: pulumi.Input<string>;
    baseDn: pulumi.Input<string>;
    bindCn: pulumi.Input<string>;
    bindPassword: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    deleteNotFoundObjects?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    enabled?: pulumi.Input<boolean>;
    /**
     * Defaults to `member`.
     */
    groupMembershipField?: pulumi.Input<string>;
    /**
     * Defaults to `(objectClass=group)`.
     */
    groupObjectFilter?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    lookupGroupsFromUser?: pulumi.Input<boolean>;
    name?: pulumi.Input<string>;
    /**
     * Defaults to `objectSid`.
     */
    objectUniquenessField?: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    passwordLoginUpdateInternalPassword?: pulumi.Input<boolean>;
    propertyMappings?: pulumi.Input<pulumi.Input<string>[]>;
    propertyMappingsGroups?: pulumi.Input<pulumi.Input<string>[]>;
    serverUri: pulumi.Input<string>;
    slug: pulumi.Input<string>;
    /**
     * Defaults to `false`.
     */
    sni?: pulumi.Input<boolean>;
    sourceLdapId?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    startTls?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    syncGroups?: pulumi.Input<boolean>;
    syncParentGroup?: pulumi.Input<string>;
    /**
     * Defaults to `true`.
     */
    syncUsers?: pulumi.Input<boolean>;
    /**
     * Defaults to `true`.
     */
    syncUsersPassword?: pulumi.Input<boolean>;
    /**
     * Defaults to `distinguishedName`.
     */
    userMembershipAttribute?: pulumi.Input<string>;
    /**
     * Defaults to `(objectClass=person)`.
     */
    userObjectFilter?: pulumi.Input<string>;
    /**
     * Defaults to `goauthentik.io/sources/%(slug)s`.
     */
    userPathTemplate?: pulumi.Input<string>;
    /**
     * Generated.
     */
    uuid?: pulumi.Input<string>;
}
