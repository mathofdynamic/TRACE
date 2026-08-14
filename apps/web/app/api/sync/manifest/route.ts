import { authenticateCliRequest } from '../../../../lib/cli-auth';
import { createRequestDatabase } from '../../../../lib/request-database';

export async function GET(request: Request) {
  const { db, client } = await createRequestDatabase();
  try {
    const connection = await authenticateCliRequest(db, request, 'sync:write');
    if (!connection)
      return Response.json({ error: 'CLI authentication required.' }, { status: 401 });
    return Response.json({
      protocolVersion: '0.1',
      sourceCodeIncluded: false,
      codeSnippetsIncluded: false,
      capabilities: {
        manifest: true,
        selectiveArtifactUpload: true,
        stagedCommit: true,
        resumableUpload: true,
      },
      limits: { maximumArtifacts: 64, maximumArtifactBytes: 262_144, maximumSyncBytes: 2_097_152 },
    });
  } finally {
    await client.end();
  }
}
