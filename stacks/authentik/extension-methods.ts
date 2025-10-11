import * as pulumi from "@pulumi/pulumi";
import * as authentik from "@pulumi/authentik";

// Track binding order for flows, applications, and stages
const bindingOrder = new Map<string, number>();

function getNextOrder(resourceName: string): number {
  const current = bindingOrder.get(resourceName) || 0;
  const next = current + 10;
  bindingOrder.set(resourceName, next);
  return next;
}

/**
 * Add a stage binding to a flow
 */
export function addFlowStageBinding(
  flow: authentik.Flow,
  stageUuid: pulumi.Input<string>,
  args?: Partial<authentik.FlowStageBindingArgs>
): authentik.FlowStageBinding {
  const resourceName = (flow as any).__name || flow.constructor.name;
  const order = getNextOrder(resourceName);

  const bindingArgs: authentik.FlowStageBindingArgs = {
    target: flow.uuid,
    stage: stageUuid,
    order,
    evaluateOnPlan: args?.evaluateOnPlan ?? false,
    reEvaluatePolicies: args?.reEvaluatePolicies ?? true,
    invalidResponseAction: args?.invalidResponseAction,
    policyEngineMode: args?.policyEngineMode,
  };

  return new authentik.FlowStageBinding(
    `${resourceName}-binding-${order.toString().padStart(2, "0")}`,
    bindingArgs,
    { parent: flow }
  );
}

/**
 * Add a policy binding to a flow
 */
export function addPolicyBindingToFlow(
  flow: authentik.Flow | authentik.FlowStageBinding,
  policyUuid: pulumi.Input<string>,
  args?: Partial<authentik.PolicyBindingArgs>
): authentik.PolicyBinding {
  const resourceName = (flow as any).__name || flow.constructor.name;
  const order = getNextOrder(resourceName);

  const targetUuid = "uuid" in flow ? flow.uuid : flow.id;

  const bindingArgs: authentik.PolicyBindingArgs = {
    target: targetUuid,
    policy: policyUuid,
    order,
    enabled: args?.enabled ?? true,
    negate: args?.negate ?? false,
    timeout: args?.timeout ?? 30,
  };

  return new authentik.PolicyBinding(
    `${resourceName}-policy-${order}`,
    bindingArgs,
    { parent: flow }
  );
}

/**
 * Add a policy binding to an application
 */
export function addPolicyBindingToApplication(
  application: authentik.Application,
  args: Partial<authentik.PolicyBindingArgs> & {
    policy?: pulumi.Input<string>;
    group?: pulumi.Input<string>;
  }
): authentik.PolicyBinding {
  const resourceName =
    (application as any).__name || application.constructor.name;
  const order = getNextOrder(resourceName);

  const bindingArgs: authentik.PolicyBindingArgs = {
    target: application.uuid,
    order,
    enabled: args.enabled ?? true,
    negate: args.negate ?? false,
    timeout: args.timeout ?? 30,
    policy: args.policy,
    group: args.group,
  };

  return new authentik.PolicyBinding(
    `${resourceName}-policy-${order}`,
    bindingArgs,
    { parent: application }
  );
}

/**
 * Add a group binding to an application (convenience wrapper)
 */
export function addGroupBindingToApplication(
  application: authentik.Application,
  groupId: pulumi.Input<string>
): authentik.PolicyBinding {
  return addPolicyBindingToApplication(application, { group: groupId });
}
