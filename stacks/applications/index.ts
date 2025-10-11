import * as pulumi from "@pulumi/pulumi";
import { OPClient } from "../../components/op.ts";
import { GlobalResources } from "../../components/globals.ts";

const globals = new GlobalResources({}, {});
