export type ProductionCanaryDeploymentAction = 'validate-only' | 'deploy';
export type ProductionCanaryRuntimeMode = 'closed' | 'fixture';

export function resolveProductionCanaryRuntimeMode(value: unknown): ProductionCanaryRuntimeMode {
  if (value === undefined || value === null || value === '') return 'closed';
  if (value === 'closed' || value === 'fixture') return value;
  throw new Error('Unsupported production runtime mode; expected closed or fixture.');
}

export function validateProductionCanaryDispatch(
  actionValue: unknown,
  runtimeModeValue: unknown,
  confirmationValue: unknown,
) {
  if (actionValue !== 'validate-only' && actionValue !== 'deploy') {
    throw new Error('Unsupported production deployment action; expected validate-only or deploy.');
  }

  const runtimeMode = resolveProductionCanaryRuntimeMode(runtimeModeValue);
  if (actionValue === 'deploy') {
    const requiredConfirmation =
      runtimeMode === 'fixture'
        ? 'DEPLOY_TRACE_PRODUCTION_FIXTURE_CANARY'
        : 'DEPLOY_TRACE_PRODUCTION_CANARY';
    if (confirmationValue !== requiredConfirmation) {
      throw new Error(`${runtimeMode} deployment requires its exact confirmation string.`);
    }
  }

  return { action: actionValue, runtimeMode } as const;
}

function main() {
  try {
    const result = validateProductionCanaryDispatch(
      process.env.DEPLOYMENT_ACTION,
      process.env.RUNTIME_MODE,
      process.env.DEPLOY_CONFIRMATION,
    );
    console.log(`Deployment action: ${result.action}`);
    console.log(`Production runtime mode: ${result.runtimeMode}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Production deployment input rejected.');
    process.exitCode = 1;
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/production-canary-deploy-contract.ts')) {
  main();
}
