import { VercelRequest, VercelResponse } from '@vercel/node';
import { analyzeRepository } from './lib/repo-analyzer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const { sessionId, targetPath } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'INVALID_INPUT', message: 'sessionId is required' });
  }

  try {
    const basePath = targetPath || process.cwd();
    console.log(`Analyzing repository at: ${basePath}`);

    const analysis = await analyzeRepository(basePath);

    res.status(200).json({
      success: true,
      ...analysis,
    });
  } catch (err: any) {
    console.error('Repository analysis error:', err.message);
    res.status(500).json({
      success: false,
      error: 'ANALYSIS_ERROR',
      message: err.message,
      files: [],
      structure: [],
      technologies: [],
      summary: 'Error analyzing repository',
    });
  }
}
