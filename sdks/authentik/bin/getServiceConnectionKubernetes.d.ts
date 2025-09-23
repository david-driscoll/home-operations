import * as pulumi from "@pulumi/pulumi";
export declare function getServiceConnectionKubernetes(args: GetServiceConnectionKubernetesArgs, opts?: pulumi.InvokeOptions): Promise<GetServiceConnectionKubernetesResult>;
/**
 * A collection of arguments for invoking getServiceConnectionKubernetes.
 */
export interface GetServiceConnectionKubernetesArgs {
    id?: string;
    kubeconfig?: string;
    local?: boolean;
    name: string;
    verifySsl?: boolean;
}
/**
 * A collection of values returned by getServiceConnectionKubernetes.
 */
export interface GetServiceConnectionKubernetesResult {
    readonly id: string;
    readonly kubeconfig: string;
    readonly local: boolean;
    readonly name: string;
    readonly verifySsl: boolean;
}
export declare function getServiceConnectionKubernetesOutput(args: GetServiceConnectionKubernetesOutputArgs, opts?: pulumi.InvokeOutputOptions): pulumi.Output<GetServiceConnectionKubernetesResult>;
/**
 * A collection of arguments for invoking getServiceConnectionKubernetes.
 */
export interface GetServiceConnectionKubernetesOutputArgs {
    id?: pulumi.Input<string>;
    kubeconfig?: pulumi.Input<string>;
    local?: pulumi.Input<boolean>;
    name: pulumi.Input<string>;
    verifySsl?: pulumi.Input<boolean>;
}
