import { op } from "@components/op.ts";
import * as pulumi from "@pulumi/pulumi";

export type OnePasswordItem = pulumi.Unwrap<ReturnType<(typeof op)["mapItem"]>>;
export type OnePasswordItemOutput = pulumi.Output<OnePasswordItem>;
