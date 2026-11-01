import * as pulumi from "@pulumi/pulumi";
import type { OPClient } from "components/op.ts";

export type OnePasswordItem = pulumi.Unwrap<ReturnType<OPClient["mapItem"]>>;
export type OnePasswordItemOutput = pulumi.Output<OnePasswordItem>;
