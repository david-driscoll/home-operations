import * as pulumi from "@pulumi/pulumi";
export declare class PolicyGeoip extends pulumi.CustomResource {
    /**
     * Get an existing PolicyGeoip resource's state with the given name, ID, and optional extra
     * properties used to qualify the lookup.
     *
     * @param name The _unique_ name of the resulting resource.
     * @param id The _unique_ provider ID of the resource to lookup.
     * @param state Any extra arguments used during the lookup.
     * @param opts Optional settings to control the behavior of the CustomResource.
     */
    static get(name: string, id: pulumi.Input<pulumi.ID>, state?: PolicyGeoipState, opts?: pulumi.CustomResourceOptions): PolicyGeoip;
    /**
     * Returns true if the given object is an instance of PolicyGeoip.  This is designed to work even
     * when multiple copies of the Pulumi SDK have been loaded into the same process.
     */
    static isInstance(obj: any): obj is PolicyGeoip;
    readonly asns: pulumi.Output<number[] | undefined>;
    readonly checkHistoryDistance: pulumi.Output<boolean | undefined>;
    readonly checkImpossibleTravel: pulumi.Output<boolean | undefined>;
    /**
     * Allowed values:
     *   - `AF`
     *   - `AX`
     *   - `AL`
     *   - `DZ`
     *   - `AS`
     *   - `AD`
     *   - `AO`
     *   - `AI`
     *   - `AQ`
     *   - `AG`
     *   - `AR`
     *   - `AM`
     *   - `AW`
     *   - `AU`
     *   - `AT`
     *   - `AZ`
     *   - `BS`
     *   - `BH`
     *   - `BD`
     *   - `BB`
     *   - `BY`
     *   - `BE`
     *   - `BZ`
     *   - `BJ`
     *   - `BM`
     *   - `BT`
     *   - `BO`
     *   - `BQ`
     *   - `BA`
     *   - `BW`
     *   - `BV`
     *   - `BR`
     *   - `IO`
     *   - `BN`
     *   - `BG`
     *   - `BF`
     *   - `BI`
     *   - `CV`
     *   - `KH`
     *   - `CM`
     *   - `CA`
     *   - `KY`
     *   - `CF`
     *   - `TD`
     *   - `CL`
     *   - `CN`
     *   - `CX`
     *   - `CC`
     *   - `CO`
     *   - `KM`
     *   - `CG`
     *   - `CD`
     *   - `CK`
     *   - `CR`
     *   - `CI`
     *   - `HR`
     *   - `CU`
     *   - `CW`
     *   - `CY`
     *   - `CZ`
     *   - `DK`
     *   - `DJ`
     *   - `DM`
     *   - `DO`
     *   - `EC`
     *   - `EG`
     *   - `SV`
     *   - `GQ`
     *   - `ER`
     *   - `EE`
     *   - `SZ`
     *   - `ET`
     *   - `FK`
     *   - `FO`
     *   - `FJ`
     *   - `FI`
     *   - `FR`
     *   - `GF`
     *   - `PF`
     *   - `TF`
     *   - `GA`
     *   - `GM`
     *   - `GE`
     *   - `DE`
     *   - `GH`
     *   - `GI`
     *   - `GR`
     *   - `GL`
     *   - `GD`
     *   - `GP`
     *   - `GU`
     *   - `GT`
     *   - `GG`
     *   - `GN`
     *   - `GW`
     *   - `GY`
     *   - `HT`
     *   - `HM`
     *   - `VA`
     *   - `HN`
     *   - `HK`
     *   - `HU`
     *   - `IS`
     *   - `IN`
     *   - `ID`
     *   - `IR`
     *   - `IQ`
     *   - `IE`
     *   - `IM`
     *   - `IL`
     *   - `IT`
     *   - `JM`
     *   - `JP`
     *   - `JE`
     *   - `JO`
     *   - `KZ`
     *   - `KE`
     *   - `KI`
     *   - `KW`
     *   - `KG`
     *   - `LA`
     *   - `LV`
     *   - `LB`
     *   - `LS`
     *   - `LR`
     *   - `LY`
     *   - `LI`
     *   - `LT`
     *   - `LU`
     *   - `MO`
     *   - `MG`
     *   - `MW`
     *   - `MY`
     *   - `MV`
     *   - `ML`
     *   - `MT`
     *   - `MH`
     *   - `MQ`
     *   - `MR`
     *   - `MU`
     *   - `YT`
     *   - `MX`
     *   - `FM`
     *   - `MD`
     *   - `MC`
     *   - `MN`
     *   - `ME`
     *   - `MS`
     *   - `MA`
     *   - `MZ`
     *   - `MM`
     *   - `NA`
     *   - `NR`
     *   - `NP`
     *   - `NL`
     *   - `NC`
     *   - `NZ`
     *   - `NI`
     *   - `NE`
     *   - `NG`
     *   - `NU`
     *   - `NF`
     *   - `KP`
     *   - `MK`
     *   - `MP`
     *   - `NO`
     *   - `OM`
     *   - `PK`
     *   - `PW`
     *   - `PS`
     *   - `PA`
     *   - `PG`
     *   - `PY`
     *   - `PE`
     *   - `PH`
     *   - `PN`
     *   - `PL`
     *   - `PT`
     *   - `PR`
     *   - `QA`
     *   - `RE`
     *   - `RO`
     *   - `RU`
     *   - `RW`
     *   - `BL`
     *   - `SH`
     *   - `KN`
     *   - `LC`
     *   - `MF`
     *   - `PM`
     *   - `VC`
     *   - `WS`
     *   - `SM`
     *   - `ST`
     *   - `SA`
     *   - `SN`
     *   - `RS`
     *   - `SC`
     *   - `SL`
     *   - `SG`
     *   - `SX`
     *   - `SK`
     *   - `SI`
     *   - `SB`
     *   - `SO`
     *   - `ZA`
     *   - `GS`
     *   - `KR`
     *   - `SS`
     *   - `ES`
     *   - `LK`
     *   - `SD`
     *   - `SR`
     *   - `SJ`
     *   - `SE`
     *   - `CH`
     *   - `SY`
     *   - `TW`
     *   - `TJ`
     *   - `TZ`
     *   - `TH`
     *   - `TL`
     *   - `TG`
     *   - `TK`
     *   - `TO`
     *   - `TT`
     *   - `TN`
     *   - `TR`
     *   - `TM`
     *   - `TC`
     *   - `TV`
     *   - `UG`
     *   - `UA`
     *   - `AE`
     *   - `GB`
     *   - `UM`
     *   - `US`
     *   - `UY`
     *   - `UZ`
     *   - `VU`
     *   - `VE`
     *   - `VN`
     *   - `VG`
     *   - `VI`
     *   - `WF`
     *   - `EH`
     *   - `YE`
     *   - `ZM`
     *   - `ZW`
     */
    readonly countries: pulumi.Output<string[] | undefined>;
    /**
     * Defaults to `50`.
     */
    readonly distanceToleranceKm: pulumi.Output<number | undefined>;
    /**
     * Defaults to `false`.
     */
    readonly executionLogging: pulumi.Output<boolean | undefined>;
    /**
     * Defaults to `5`.
     */
    readonly historyLoginCount: pulumi.Output<number | undefined>;
    /**
     * Defaults to `100`.
     */
    readonly historyMaxDistanceKm: pulumi.Output<number | undefined>;
    /**
     * Defaults to `100`.
     */
    readonly impossibleToleranceKm: pulumi.Output<number | undefined>;
    readonly name: pulumi.Output<string>;
    readonly policyGeoipId: pulumi.Output<string>;
    /**
     * Create a PolicyGeoip resource with the given unique name, arguments, and options.
     *
     * @param name The _unique_ name of the resource.
     * @param args The arguments to use to populate this resource's properties.
     * @param opts A bag of options that control this resource's behavior.
     */
    constructor(name: string, args?: PolicyGeoipArgs, opts?: pulumi.CustomResourceOptions);
}
/**
 * Input properties used for looking up and filtering PolicyGeoip resources.
 */
export interface PolicyGeoipState {
    asns?: pulumi.Input<pulumi.Input<number>[]>;
    checkHistoryDistance?: pulumi.Input<boolean>;
    checkImpossibleTravel?: pulumi.Input<boolean>;
    /**
     * Allowed values:
     *   - `AF`
     *   - `AX`
     *   - `AL`
     *   - `DZ`
     *   - `AS`
     *   - `AD`
     *   - `AO`
     *   - `AI`
     *   - `AQ`
     *   - `AG`
     *   - `AR`
     *   - `AM`
     *   - `AW`
     *   - `AU`
     *   - `AT`
     *   - `AZ`
     *   - `BS`
     *   - `BH`
     *   - `BD`
     *   - `BB`
     *   - `BY`
     *   - `BE`
     *   - `BZ`
     *   - `BJ`
     *   - `BM`
     *   - `BT`
     *   - `BO`
     *   - `BQ`
     *   - `BA`
     *   - `BW`
     *   - `BV`
     *   - `BR`
     *   - `IO`
     *   - `BN`
     *   - `BG`
     *   - `BF`
     *   - `BI`
     *   - `CV`
     *   - `KH`
     *   - `CM`
     *   - `CA`
     *   - `KY`
     *   - `CF`
     *   - `TD`
     *   - `CL`
     *   - `CN`
     *   - `CX`
     *   - `CC`
     *   - `CO`
     *   - `KM`
     *   - `CG`
     *   - `CD`
     *   - `CK`
     *   - `CR`
     *   - `CI`
     *   - `HR`
     *   - `CU`
     *   - `CW`
     *   - `CY`
     *   - `CZ`
     *   - `DK`
     *   - `DJ`
     *   - `DM`
     *   - `DO`
     *   - `EC`
     *   - `EG`
     *   - `SV`
     *   - `GQ`
     *   - `ER`
     *   - `EE`
     *   - `SZ`
     *   - `ET`
     *   - `FK`
     *   - `FO`
     *   - `FJ`
     *   - `FI`
     *   - `FR`
     *   - `GF`
     *   - `PF`
     *   - `TF`
     *   - `GA`
     *   - `GM`
     *   - `GE`
     *   - `DE`
     *   - `GH`
     *   - `GI`
     *   - `GR`
     *   - `GL`
     *   - `GD`
     *   - `GP`
     *   - `GU`
     *   - `GT`
     *   - `GG`
     *   - `GN`
     *   - `GW`
     *   - `GY`
     *   - `HT`
     *   - `HM`
     *   - `VA`
     *   - `HN`
     *   - `HK`
     *   - `HU`
     *   - `IS`
     *   - `IN`
     *   - `ID`
     *   - `IR`
     *   - `IQ`
     *   - `IE`
     *   - `IM`
     *   - `IL`
     *   - `IT`
     *   - `JM`
     *   - `JP`
     *   - `JE`
     *   - `JO`
     *   - `KZ`
     *   - `KE`
     *   - `KI`
     *   - `KW`
     *   - `KG`
     *   - `LA`
     *   - `LV`
     *   - `LB`
     *   - `LS`
     *   - `LR`
     *   - `LY`
     *   - `LI`
     *   - `LT`
     *   - `LU`
     *   - `MO`
     *   - `MG`
     *   - `MW`
     *   - `MY`
     *   - `MV`
     *   - `ML`
     *   - `MT`
     *   - `MH`
     *   - `MQ`
     *   - `MR`
     *   - `MU`
     *   - `YT`
     *   - `MX`
     *   - `FM`
     *   - `MD`
     *   - `MC`
     *   - `MN`
     *   - `ME`
     *   - `MS`
     *   - `MA`
     *   - `MZ`
     *   - `MM`
     *   - `NA`
     *   - `NR`
     *   - `NP`
     *   - `NL`
     *   - `NC`
     *   - `NZ`
     *   - `NI`
     *   - `NE`
     *   - `NG`
     *   - `NU`
     *   - `NF`
     *   - `KP`
     *   - `MK`
     *   - `MP`
     *   - `NO`
     *   - `OM`
     *   - `PK`
     *   - `PW`
     *   - `PS`
     *   - `PA`
     *   - `PG`
     *   - `PY`
     *   - `PE`
     *   - `PH`
     *   - `PN`
     *   - `PL`
     *   - `PT`
     *   - `PR`
     *   - `QA`
     *   - `RE`
     *   - `RO`
     *   - `RU`
     *   - `RW`
     *   - `BL`
     *   - `SH`
     *   - `KN`
     *   - `LC`
     *   - `MF`
     *   - `PM`
     *   - `VC`
     *   - `WS`
     *   - `SM`
     *   - `ST`
     *   - `SA`
     *   - `SN`
     *   - `RS`
     *   - `SC`
     *   - `SL`
     *   - `SG`
     *   - `SX`
     *   - `SK`
     *   - `SI`
     *   - `SB`
     *   - `SO`
     *   - `ZA`
     *   - `GS`
     *   - `KR`
     *   - `SS`
     *   - `ES`
     *   - `LK`
     *   - `SD`
     *   - `SR`
     *   - `SJ`
     *   - `SE`
     *   - `CH`
     *   - `SY`
     *   - `TW`
     *   - `TJ`
     *   - `TZ`
     *   - `TH`
     *   - `TL`
     *   - `TG`
     *   - `TK`
     *   - `TO`
     *   - `TT`
     *   - `TN`
     *   - `TR`
     *   - `TM`
     *   - `TC`
     *   - `TV`
     *   - `UG`
     *   - `UA`
     *   - `AE`
     *   - `GB`
     *   - `UM`
     *   - `US`
     *   - `UY`
     *   - `UZ`
     *   - `VU`
     *   - `VE`
     *   - `VN`
     *   - `VG`
     *   - `VI`
     *   - `WF`
     *   - `EH`
     *   - `YE`
     *   - `ZM`
     *   - `ZW`
     */
    countries?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Defaults to `50`.
     */
    distanceToleranceKm?: pulumi.Input<number>;
    /**
     * Defaults to `false`.
     */
    executionLogging?: pulumi.Input<boolean>;
    /**
     * Defaults to `5`.
     */
    historyLoginCount?: pulumi.Input<number>;
    /**
     * Defaults to `100`.
     */
    historyMaxDistanceKm?: pulumi.Input<number>;
    /**
     * Defaults to `100`.
     */
    impossibleToleranceKm?: pulumi.Input<number>;
    name?: pulumi.Input<string>;
    policyGeoipId?: pulumi.Input<string>;
}
/**
 * The set of arguments for constructing a PolicyGeoip resource.
 */
export interface PolicyGeoipArgs {
    asns?: pulumi.Input<pulumi.Input<number>[]>;
    checkHistoryDistance?: pulumi.Input<boolean>;
    checkImpossibleTravel?: pulumi.Input<boolean>;
    /**
     * Allowed values:
     *   - `AF`
     *   - `AX`
     *   - `AL`
     *   - `DZ`
     *   - `AS`
     *   - `AD`
     *   - `AO`
     *   - `AI`
     *   - `AQ`
     *   - `AG`
     *   - `AR`
     *   - `AM`
     *   - `AW`
     *   - `AU`
     *   - `AT`
     *   - `AZ`
     *   - `BS`
     *   - `BH`
     *   - `BD`
     *   - `BB`
     *   - `BY`
     *   - `BE`
     *   - `BZ`
     *   - `BJ`
     *   - `BM`
     *   - `BT`
     *   - `BO`
     *   - `BQ`
     *   - `BA`
     *   - `BW`
     *   - `BV`
     *   - `BR`
     *   - `IO`
     *   - `BN`
     *   - `BG`
     *   - `BF`
     *   - `BI`
     *   - `CV`
     *   - `KH`
     *   - `CM`
     *   - `CA`
     *   - `KY`
     *   - `CF`
     *   - `TD`
     *   - `CL`
     *   - `CN`
     *   - `CX`
     *   - `CC`
     *   - `CO`
     *   - `KM`
     *   - `CG`
     *   - `CD`
     *   - `CK`
     *   - `CR`
     *   - `CI`
     *   - `HR`
     *   - `CU`
     *   - `CW`
     *   - `CY`
     *   - `CZ`
     *   - `DK`
     *   - `DJ`
     *   - `DM`
     *   - `DO`
     *   - `EC`
     *   - `EG`
     *   - `SV`
     *   - `GQ`
     *   - `ER`
     *   - `EE`
     *   - `SZ`
     *   - `ET`
     *   - `FK`
     *   - `FO`
     *   - `FJ`
     *   - `FI`
     *   - `FR`
     *   - `GF`
     *   - `PF`
     *   - `TF`
     *   - `GA`
     *   - `GM`
     *   - `GE`
     *   - `DE`
     *   - `GH`
     *   - `GI`
     *   - `GR`
     *   - `GL`
     *   - `GD`
     *   - `GP`
     *   - `GU`
     *   - `GT`
     *   - `GG`
     *   - `GN`
     *   - `GW`
     *   - `GY`
     *   - `HT`
     *   - `HM`
     *   - `VA`
     *   - `HN`
     *   - `HK`
     *   - `HU`
     *   - `IS`
     *   - `IN`
     *   - `ID`
     *   - `IR`
     *   - `IQ`
     *   - `IE`
     *   - `IM`
     *   - `IL`
     *   - `IT`
     *   - `JM`
     *   - `JP`
     *   - `JE`
     *   - `JO`
     *   - `KZ`
     *   - `KE`
     *   - `KI`
     *   - `KW`
     *   - `KG`
     *   - `LA`
     *   - `LV`
     *   - `LB`
     *   - `LS`
     *   - `LR`
     *   - `LY`
     *   - `LI`
     *   - `LT`
     *   - `LU`
     *   - `MO`
     *   - `MG`
     *   - `MW`
     *   - `MY`
     *   - `MV`
     *   - `ML`
     *   - `MT`
     *   - `MH`
     *   - `MQ`
     *   - `MR`
     *   - `MU`
     *   - `YT`
     *   - `MX`
     *   - `FM`
     *   - `MD`
     *   - `MC`
     *   - `MN`
     *   - `ME`
     *   - `MS`
     *   - `MA`
     *   - `MZ`
     *   - `MM`
     *   - `NA`
     *   - `NR`
     *   - `NP`
     *   - `NL`
     *   - `NC`
     *   - `NZ`
     *   - `NI`
     *   - `NE`
     *   - `NG`
     *   - `NU`
     *   - `NF`
     *   - `KP`
     *   - `MK`
     *   - `MP`
     *   - `NO`
     *   - `OM`
     *   - `PK`
     *   - `PW`
     *   - `PS`
     *   - `PA`
     *   - `PG`
     *   - `PY`
     *   - `PE`
     *   - `PH`
     *   - `PN`
     *   - `PL`
     *   - `PT`
     *   - `PR`
     *   - `QA`
     *   - `RE`
     *   - `RO`
     *   - `RU`
     *   - `RW`
     *   - `BL`
     *   - `SH`
     *   - `KN`
     *   - `LC`
     *   - `MF`
     *   - `PM`
     *   - `VC`
     *   - `WS`
     *   - `SM`
     *   - `ST`
     *   - `SA`
     *   - `SN`
     *   - `RS`
     *   - `SC`
     *   - `SL`
     *   - `SG`
     *   - `SX`
     *   - `SK`
     *   - `SI`
     *   - `SB`
     *   - `SO`
     *   - `ZA`
     *   - `GS`
     *   - `KR`
     *   - `SS`
     *   - `ES`
     *   - `LK`
     *   - `SD`
     *   - `SR`
     *   - `SJ`
     *   - `SE`
     *   - `CH`
     *   - `SY`
     *   - `TW`
     *   - `TJ`
     *   - `TZ`
     *   - `TH`
     *   - `TL`
     *   - `TG`
     *   - `TK`
     *   - `TO`
     *   - `TT`
     *   - `TN`
     *   - `TR`
     *   - `TM`
     *   - `TC`
     *   - `TV`
     *   - `UG`
     *   - `UA`
     *   - `AE`
     *   - `GB`
     *   - `UM`
     *   - `US`
     *   - `UY`
     *   - `UZ`
     *   - `VU`
     *   - `VE`
     *   - `VN`
     *   - `VG`
     *   - `VI`
     *   - `WF`
     *   - `EH`
     *   - `YE`
     *   - `ZM`
     *   - `ZW`
     */
    countries?: pulumi.Input<pulumi.Input<string>[]>;
    /**
     * Defaults to `50`.
     */
    distanceToleranceKm?: pulumi.Input<number>;
    /**
     * Defaults to `false`.
     */
    executionLogging?: pulumi.Input<boolean>;
    /**
     * Defaults to `5`.
     */
    historyLoginCount?: pulumi.Input<number>;
    /**
     * Defaults to `100`.
     */
    historyMaxDistanceKm?: pulumi.Input<number>;
    /**
     * Defaults to `100`.
     */
    impossibleToleranceKm?: pulumi.Input<number>;
    name?: pulumi.Input<string>;
    policyGeoipId?: pulumi.Input<string>;
}
