import type { OPClient } from "@components/op.ts";
import * as pulumi from "@pulumi/pulumi";

export type OnePasswordItem = pulumi.Unwrap<ReturnType<OPClient["mapItem"]>>;
export type OnePasswordItemOutput = pulumi.Output<OnePasswordItem>;
