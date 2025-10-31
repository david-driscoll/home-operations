export { DatastoreArgs, DatastoreState } from "./datastore";
export type Datastore = import("./datastore").Datastore;
export declare const Datastore: typeof import("./datastore").Datastore;
export * from "./provider";
export { S3EndpointArgs, S3EndpointState } from "./s3endpoint";
export type S3Endpoint = import("./s3endpoint").S3Endpoint;
export declare const S3Endpoint: typeof import("./s3endpoint").S3Endpoint;
import * as config from "./config";
export { config, };
