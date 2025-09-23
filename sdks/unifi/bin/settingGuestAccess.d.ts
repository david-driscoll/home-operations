import * as pulumi from "@pulumi/pulumi";
import * as inputs from "./types/input";
import * as outputs from "./types/output";
export declare class SettingGuestAccess extends pulumi.CustomResource {
    /**
     * Get an existing SettingGuestAccess resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: SettingGuestAccessState, opts?: pulumi.CustomResourceOptions): SettingGuestAccess;
    /**
     * Returns true if the given object is an instance of SettingGuestAccess.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is SettingGuestAccess;
    /**
     * Subnet allowed for guest access.
     */
    readonly allowedSubnet: pulumi.Output<string>;
    /**
     * Authentication method for guest access. Valid values are:
     * * `none` - No authentication required
     * * `hotspot` - Password authentication
     * * `facebook_wifi` - Facebook auth entication
     * * `custom` - Custom authentication
     *
     * For password authentication, set `auth` to `hotspot` and `password_enabled` to `true`.
     * For voucher authentication, set `auth` to `hotspot` and `voucher_enabled` to `true`.
     * For payment authentication, set `auth` to `hotspot` and `payment_enabled` to `true`.
     */
    readonly auth: pulumi.Output<string>;
    /**
     * URL for authentication. Must be a valid URL including the protocol.
     */
    readonly authUrl: pulumi.Output<string>;
    /**
     * Authorize.net payment settings.
     */
    readonly authorize: pulumi.Output<outputs.SettingGuestAccessAuthorize | undefined>;
    /**
     * Custom IP address. Must be a valid IPv4 address (e.g., `192.168.1.1`).
     */
    readonly customIp: pulumi.Output<string | undefined>;
    /**
     * Enable enterprise controller functionality.
     */
    readonly ecEnabled: pulumi.Output<boolean>;
    /**
     * Expiration time for guest access.
     */
    readonly expire: pulumi.Output<number>;
    /**
     * Number value for the expiration time.
     */
    readonly expireNumber: pulumi.Output<number>;
    /**
     * Unit for the expiration time. Valid values are:
     * * `1` - Minute
     * * `60` - Hour
     * * `1440` - Day
     * * `10080` - Week
     */
    readonly expireUnit: pulumi.Output<number>;
    /**
     * Facebook authentication settings.
     */
    readonly facebook: pulumi.Output<outputs.SettingGuestAccessFacebook | undefined>;
    /**
     * Whether Facebook authentication for guest access is enabled.
     */
    readonly facebookEnabled: pulumi.Output<boolean>;
    /**
     * Facebook WiFi authentication settings.
     */
    readonly facebookWifi: pulumi.Output<outputs.SettingGuestAccessFacebookWifi | undefined>;
    /**
     * Google authentication settings.
     */
    readonly google: pulumi.Output<outputs.SettingGuestAccessGoogle | undefined>;
    /**
     * Whether Google authentication for guest access is enabled.
     */
    readonly googleEnabled: pulumi.Output<boolean>;
    /**
     * IPpay Payments settings.
     */
    readonly ippay: pulumi.Output<outputs.SettingGuestAccessIppay | undefined>;
    /**
     * MerchantWarrior payment settings.
     */
    readonly merchantWarrior: pulumi.Output<outputs.SettingGuestAccessMerchantWarrior | undefined>;
    /**
     * Password for guest access.
     */
    readonly password: pulumi.Output<string | undefined>;
    /**
     * Enable password authentication for guest access.
     */
    readonly passwordEnabled: pulumi.Output<boolean>;
    /**
     * Enable payment for guest access.
     */
    readonly paymentEnabled: pulumi.Output<boolean>;
    /**
     * Payment gateway. Valid values are:
     * * `paypal` - PayPal
     * * `stripe` - Stripe
     * * `authorize` - Authorize.net
     * * `quickpay` - QuickPay
     * * `merchantwarrior` - Merchant Warrior
     * * `ippay` - IP Payments
     */
    readonly paymentGateway: pulumi.Output<string | undefined>;
    /**
     * PayPal payment settings.
     */
    readonly paypal: pulumi.Output<outputs.SettingGuestAccessPaypal | undefined>;
    /**
     * Portal customization settings.
     */
    readonly portalCustomization: pulumi.Output<outputs.SettingGuestAccessPortalCustomization>;
    /**
     * Enable the guest portal.
     */
    readonly portalEnabled: pulumi.Output<boolean>;
    /**
     * Hostname to use for the captive portal.
     */
    readonly portalHostname: pulumi.Output<string>;
    /**
     * Use a custom hostname for the portal.
     */
    readonly portalUseHostname: pulumi.Output<boolean>;
    /**
     * QuickPay payment settings.
     */
    readonly quickpay: pulumi.Output<outputs.SettingGuestAccessQuickpay | undefined>;
    /**
     * RADIUS authentication settings.
     */
    readonly radius: pulumi.Output<outputs.SettingGuestAccessRadius | undefined>;
    /**
     * Whether RADIUS authentication for guest access is enabled.
     */
    readonly radiusEnabled: pulumi.Output<boolean>;
    /**
     * Redirect after authentication settings.
     */
    readonly redirect: pulumi.Output<outputs.SettingGuestAccessRedirect | undefined>;
    /**
     * Whether redirect after authentication is enabled.
     */
    readonly redirectEnabled: pulumi.Output<boolean>;
    /**
     * Whether restricted DNS servers for guest networks are enabled.
     */
    readonly restrictedDnsEnabled: pulumi.Output<boolean>;
    /**
     * List of restricted DNS servers for guest networks. Each value must be a valid IPv4 address.
     */
    readonly restrictedDnsServers: pulumi.Output<string[]>;
    /**
     * Subnet for restricted guest access.
     */
    readonly restrictedSubnet: pulumi.Output<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    readonly site: pulumi.Output<string>;
    /**
     * Stripe payment settings.
     */
    readonly stripe: pulumi.Output<outputs.SettingGuestAccessStripe | undefined>;
    /**
     * Template engine for the portal. Valid values are: `jsp`, `angular`.
     */
    readonly templateEngine: pulumi.Output<string>;
    /**
     * Whether vouchers are customized.
     */
    readonly voucherCustomized: pulumi.Output<boolean>;
    /**
     * Enable voucher-based authentication for guest access.
     */
    readonly voucherEnabled: pulumi.Output<boolean>;
    /**
     * WeChat authentication settings.
     */
    readonly wechat: pulumi.Output<outputs.SettingGuestAccessWechat | undefined>;
    /**
     * Whether WeChat authentication for guest access is enabled.
     */
    readonly wechatEnabled: pulumi.Output<boolean>;
    /**
     * Create a SettingGuestAccess resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: SettingGuestAccessArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering SettingGuestAccess resources.
 */
export interface SettingGuestAccessState {
    /**
     * Subnet allowed for guest access.
     */
    allowedSubnet?: pulumi.Input<string>;
    /**
     * Authentication method for guest access. Valid values are:
     * * `none` - No authentication required
     * * `hotspot` - Password authentication
     * * `facebook_wifi` - Facebook auth entication
     * * `custom` - Custom authentication
     *
     * For password authentication, set `auth` to `hotspot` and `password_enabled` to `true`.
     * For voucher authentication, set `auth` to `hotspot` and `voucher_enabled` to `true`.
     * For payment authentication, set `auth` to `hotspot` and `payment_enabled` to `true`.
     */
    auth?: pulumi.Input<string>;
    /**
     * URL for authentication. Must be a valid URL including the protocol.
     */
    authUrl?: pulumi.Input<string>;
    /**
     * Authorize.net payment settings.
     */
    authorize?: pulumi.Input<inputs.SettingGuestAccessAuthorize>;
    /**
     * Custom IP address. Must be a valid IPv4 address (e.g., `192.168.1.1`).
     */
    customIp?: pulumi.Input<string>;
    /**
     * Enable enterprise controller functionality.
     */
    ecEnabled?: pulumi.Input<boolean>;
    /**
     * Expiration time for guest access.
     */
    expire?: pulumi.Input<number>;
    /**
     * Number value for the expiration time.
     */
    expireNumber?: pulumi.Input<number>;
    /**
     * Unit for the expiration time. Valid values are:
     * * `1` - Minute
     * * `60` - Hour
     * * `1440` - Day
     * * `10080` - Week
     */
    expireUnit?: pulumi.Input<number>;
    /**
     * Facebook authentication settings.
     */
    facebook?: pulumi.Input<inputs.SettingGuestAccessFacebook>;
    /**
     * Whether Facebook authentication for guest access is enabled.
     */
    facebookEnabled?: pulumi.Input<boolean>;
    /**
     * Facebook WiFi authentication settings.
     */
    facebookWifi?: pulumi.Input<inputs.SettingGuestAccessFacebookWifi>;
    /**
     * Google authentication settings.
     */
    google?: pulumi.Input<inputs.SettingGuestAccessGoogle>;
    /**
     * Whether Google authentication for guest access is enabled.
     */
    googleEnabled?: pulumi.Input<boolean>;
    /**
     * IPpay Payments settings.
     */
    ippay?: pulumi.Input<inputs.SettingGuestAccessIppay>;
    /**
     * MerchantWarrior payment settings.
     */
    merchantWarrior?: pulumi.Input<inputs.SettingGuestAccessMerchantWarrior>;
    /**
     * Password for guest access.
     */
    password?: pulumi.Input<string>;
    /**
     * Enable password authentication for guest access.
     */
    passwordEnabled?: pulumi.Input<boolean>;
    /**
     * Enable payment for guest access.
     */
    paymentEnabled?: pulumi.Input<boolean>;
    /**
     * Payment gateway. Valid values are:
     * * `paypal` - PayPal
     * * `stripe` - Stripe
     * * `authorize` - Authorize.net
     * * `quickpay` - QuickPay
     * * `merchantwarrior` - Merchant Warrior
     * * `ippay` - IP Payments
     */
    paymentGateway?: pulumi.Input<string>;
    /**
     * PayPal payment settings.
     */
    paypal?: pulumi.Input<inputs.SettingGuestAccessPaypal>;
    /**
     * Portal customization settings.
     */
    portalCustomization?: pulumi.Input<inputs.SettingGuestAccessPortalCustomization>;
    /**
     * Enable the guest portal.
     */
    portalEnabled?: pulumi.Input<boolean>;
    /**
     * Hostname to use for the captive portal.
     */
    portalHostname?: pulumi.Input<string>;
    /**
     * Use a custom hostname for the portal.
     */
    portalUseHostname?: pulumi.Input<boolean>;
    /**
     * QuickPay payment settings.
     */
    quickpay?: pulumi.Input<inputs.SettingGuestAccessQuickpay>;
    /**
     * RADIUS authentication settings.
     */
    radius?: pulumi.Input<inputs.SettingGuestAccessRadius>;
    /**
     * Whether RADIUS authentication for guest access is enabled.
     */
    radiusEnabled?: pulumi.Input<boolean>;
    /**
     * Redirect after authentication settings.
     */
    redirect?: pulumi.Input<inputs.SettingGuestAccessRedirect>;
    /**
     * Whether redirect after authentication is enabled.
     */
    redirectEnabled?: pulumi.Input<boolean>;
    /**
     * Whether restricted DNS servers for guest networks are enabled.
     */
    restrictedDnsEnabled?: pulumi.Input<boolean>;
    /**
     * List of restricted DNS servers for guest networks. Each value must be a valid IPv4 address.
     */
    restrictedDnsServers?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Subnet for restricted guest access.
     */
    restrictedSubnet?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Stripe payment settings.
     */
    stripe?: pulumi.Input<inputs.SettingGuestAccessStripe>;
    /**
     * Template engine for the portal. Valid values are: `jsp`, `angular`.
     */
    templateEngine?: pulumi.Input<string>;
    /**
     * Whether vouchers are customized.
     */
    voucherCustomized?: pulumi.Input<boolean>;
    /**
     * Enable voucher-based authentication for guest access.
     */
    voucherEnabled?: pulumi.Input<boolean>;
    /**
     * WeChat authentication settings.
     */
    wechat?: pulumi.Input<inputs.SettingGuestAccessWechat>;
    /**
     * Whether WeChat authentication for guest access is enabled.
     */
    wechatEnabled?: pulumi.Input<boolean>;
}
/**
 * The set of arguments for constructing a SettingGuestAccess resource.
 */
export interface SettingGuestAccessArgs {
    /**
     * Subnet allowed for guest access.
     */
    allowedSubnet?: pulumi.Input<string>;
    /**
     * Authentication method for guest access. Valid values are:
     * * `none` - No authentication required
     * * `hotspot` - Password authentication
     * * `facebook_wifi` - Facebook auth entication
     * * `custom` - Custom authentication
     *
     * For password authentication, set `auth` to `hotspot` and `password_enabled` to `true`.
     * For voucher authentication, set `auth` to `hotspot` and `voucher_enabled` to `true`.
     * For payment authentication, set `auth` to `hotspot` and `payment_enabled` to `true`.
     */
    auth?: pulumi.Input<string>;
    /**
     * URL for authentication. Must be a valid URL including the protocol.
     */
    authUrl?: pulumi.Input<string>;
    /**
     * Authorize.net payment settings.
     */
    authorize?: pulumi.Input<inputs.SettingGuestAccessAuthorize>;
    /**
     * Custom IP address. Must be a valid IPv4 address (e.g., `192.168.1.1`).
     */
    customIp?: pulumi.Input<string>;
    /**
     * Enable enterprise controller functionality.
     */
    ecEnabled?: pulumi.Input<boolean>;
    /**
     * Expiration time for guest access.
     */
    expire?: pulumi.Input<number>;
    /**
     * Number value for the expiration time.
     */
    expireNumber?: pulumi.Input<number>;
    /**
     * Unit for the expiration time. Valid values are:
     * * `1` - Minute
     * * `60` - Hour
     * * `1440` - Day
     * * `10080` - Week
     */
    expireUnit?: pulumi.Input<number>;
    /**
     * Facebook authentication settings.
     */
    facebook?: pulumi.Input<inputs.SettingGuestAccessFacebook>;
    /**
     * Facebook WiFi authentication settings.
     */
    facebookWifi?: pulumi.Input<inputs.SettingGuestAccessFacebookWifi>;
    /**
     * Google authentication settings.
     */
    google?: pulumi.Input<inputs.SettingGuestAccessGoogle>;
    /**
     * IPpay Payments settings.
     */
    ippay?: pulumi.Input<inputs.SettingGuestAccessIppay>;
    /**
     * MerchantWarrior payment settings.
     */
    merchantWarrior?: pulumi.Input<inputs.SettingGuestAccessMerchantWarrior>;
    /**
     * Password for guest access.
     */
    password?: pulumi.Input<string>;
    /**
     * Payment gateway. Valid values are:
     * * `paypal` - PayPal
     * * `stripe` - Stripe
     * * `authorize` - Authorize.net
     * * `quickpay` - QuickPay
     * * `merchantwarrior` - Merchant Warrior
     * * `ippay` - IP Payments
     */
    paymentGateway?: pulumi.Input<string>;
    /**
     * PayPal payment settings.
     */
    paypal?: pulumi.Input<inputs.SettingGuestAccessPaypal>;
    /**
     * Portal customization settings.
     */
    portalCustomization?: pulumi.Input<inputs.SettingGuestAccessPortalCustomization>;
    /**
     * Enable the guest portal.
     */
    portalEnabled?: pulumi.Input<boolean>;
    /**
     * Hostname to use for the captive portal.
     */
    portalHostname?: pulumi.Input<string>;
    /**
     * Use a custom hostname for the portal.
     */
    portalUseHostname?: pulumi.Input<boolean>;
    /**
     * QuickPay payment settings.
     */
    quickpay?: pulumi.Input<inputs.SettingGuestAccessQuickpay>;
    /**
     * RADIUS authentication settings.
     */
    radius?: pulumi.Input<inputs.SettingGuestAccessRadius>;
    /**
     * Redirect after authentication settings.
     */
    redirect?: pulumi.Input<inputs.SettingGuestAccessRedirect>;
    /**
     * List of restricted DNS servers for guest networks. Each value must be a valid IPv4 address.
     */
    restrictedDnsServers?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Subnet for restricted guest access.
     */
    restrictedSubnet?: pulumi.Input<string>;
    /**
     * The name of the UniFi site where this resource should be applied. If not specified, the default site will be used.
     */
    site?: pulumi.Input<string>;
    /**
     * Stripe payment settings.
     */
    stripe?: pulumi.Input<inputs.SettingGuestAccessStripe>;
    /**
     * Template engine for the portal. Valid values are: `jsp`, `angular`.
     */
    templateEngine?: pulumi.Input<string>;
    /**
     * Whether vouchers are customized.
     */
    voucherCustomized?: pulumi.Input<boolean>;
    /**
     * Enable voucher-based authentication for guest access.
     */
    voucherEnabled?: pulumi.Input<boolean>;
    /**
     * WeChat authentication settings.
     */
    wechat?: pulumi.Input<inputs.SettingGuestAccessWechat>;
}
