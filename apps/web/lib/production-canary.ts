export type ProductionCanaryRuntime = {
  TRACE_DEPLOYMENT_ENV?: string;
  TRACE_CANARY_MODE?: string;
};

export function isClosedProductionCanary(env: ProductionCanaryRuntime | null | undefined): boolean {
  return env?.TRACE_DEPLOYMENT_ENV === 'production' && env.TRACE_CANARY_MODE === 'closed';
}

export function productionCanaryClosedResponse() {
  return Response.json(
    { error: 'GitHub integration is disabled during the closed production canary.' },
    { status: 503, headers: { 'cache-control': 'no-store' } },
  );
}
