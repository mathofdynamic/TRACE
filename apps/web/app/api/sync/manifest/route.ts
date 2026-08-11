import { getTraceSession } from '@trace/auth';

export async function GET(request: Request) {
  const session = await getTraceSession(request.headers);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  return Response.json({
    protocolVersion: '0.1',
    sourceCodeIncluded: false,
    capabilities: { manifest: true, selectiveArtifactUpload: false, resumableUpload: false },
    message:
      'Manifest negotiation is available; artifact upload requires a configured organization policy.',
  });
}

export async function POST(request: Request) {
  const session = await getTraceSession(request.headers);
  if (!session?.user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const body = (await request.json()) as { sourceCodeIncluded?: unknown; artifacts?: unknown };
  if (body.sourceCodeIncluded !== false || !Array.isArray(body.artifacts)) {
    return Response.json(
      { error: 'Only source-free artifact manifests are accepted.' },
      { status: 400 },
    );
  }
  return Response.json({
    protocolVersion: '0.1',
    accepted: true,
    missing: [],
    conflicts: [],
    sourceCodeIncluded: false,
  });
}
