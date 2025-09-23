import * as pulumi from "@pulumi/pulumi";
export interface StatusPagePublicGroupList {
    /**
     * Group identifier
     */
    id?: pulumi.Input<number>;
    /**
     * List of monitor IDs in the group
     */
    monitorLists?: pulumi.Input<pulumi.Input<number>[]>;
    /**
     * Group name
     */
    name: pulumi.Input<string>;
    /**
     * Group order weight
     */
    weight?: pulumi.Input<number>;
}
