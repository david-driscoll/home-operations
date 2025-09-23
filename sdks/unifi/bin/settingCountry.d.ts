import * as pulumi from "@pulumi/pulumi";
export declare class SettingCountry extends pulumi.CustomResource {
    /**
     * Get an existing SettingCountry resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingCountryState, opts?: pulumi.CustomResourceOptions): SettingCountry;
    /**
     * Returns true if the given object is an instance of SettingCountry.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingCountry;
    /**
     * The country code to set for the UniFi site. The country code must be a valid ISO 3166-1 alpha-2 code.
     */
    readonly code: pulumi.Output<string>;
    /**
     * The numeric representation in ISO 3166-1 of the country code.
     */
    readonly codeNumeric: pulumi.Output<number>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Create a SettingCountry resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args: SettingCountryArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingCountry resources.
 */
export interface SettingCountryState {
    /**
     * The country code to set for the UniFi site. The country code must be a valid ISO 3166-1 alpha-2 code.
     */
    code?: pulumi.Input<string>;
    /**
     * The numeric representation in ISO 3166-1 of the country code.
     */
    codeNumeric?: pulumi.Input<number>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a SettingCountry resource.
 */
export interface SettingCountryArgs {
    /**
     * The country code to set for the UniFi site. The country code must be a valid ISO 3166-1 alpha-2 code.
     */
    code: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
}
