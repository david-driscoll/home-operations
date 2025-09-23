export interface StatusPagePublicGroupList {
    /**
     * Group identifier
     */
    id: number;
    /**
     * List of monitor IDs in the group
     */
    monitorLists?: number[];
    /**
     * Group name
     */
    name: string;
    /**
     * Group order weight
     */
    weight?: number;
}
