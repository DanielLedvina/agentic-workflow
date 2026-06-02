import axios from 'axios';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GH_OWNER || process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GH_REPO || process.env.GITHUB_REPO;

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.warn('GitHub environment variables not fully configured');
}

const api = axios.create({
  baseURL: GITHUB_API_BASE,
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
  },
});

interface CreatePROptions {
  title: string;
  body: string;
  branchName: string;
  baseBranch?: string;
  files: Array<{
    path: string;
    content: string;
  }>;
}

interface CreatePRResult {
  prUrl: string;
  prNumber: number;
  branchName: string;
}

export async function getMainBranchSha(): Promise<string> {
  try {
    // Try lowercase 'main' first
    try {
      const response = await api.get(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/main`);
      return response.data.object.sha;
    } catch (err: any) {
      // If not found, try capitalized 'Main'
      if (err.response?.status === 404) {
        const response = await api.get(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/Main`);
        return response.data.object.sha;
      }
      throw err;
    }
  } catch (err) {
    console.error('Failed to get main branch SHA:', err);
    throw err;
  }
}

export async function createBranch(branchName: string, baseSha: string): Promise<void> {
  try {
    await api.post(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs`, {
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });
    console.log(`Created branch: ${branchName}`);
  } catch (err: any) {
    if (err.response?.status === 422) {
      // Branch already exists, that's ok
      console.log(`Branch already exists: ${branchName}`);
      return;
    }
    throw err;
  }
}

export async function commitFiles(
  branchName: string,
  files: Array<{ path: string; content: string }>,
  message: string
): Promise<void> {
  try {
    // Get branch tip
    const branchRef = await api.get(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${branchName}`);
    const commitSha = branchRef.data.object.sha;
    const commitResponse = await api.get(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${commitSha}`);
    const treeSha = commitResponse.data.tree.sha;

    // Create new tree with file changes
    const treeItems = files.map((file) => ({
      path: file.path,
      mode: '100644' as const,
      type: 'blob' as const,
      content: file.content,
    }));

    const newTreeResponse = await api.post(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`, {
      base_tree: treeSha,
      tree: treeItems,
    });

    // Create commit
    const newCommitResponse = await api.post(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`, {
      message,
      tree: newTreeResponse.data.sha,
      parents: [commitSha],
    });

    // Update branch ref
    await api.patch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${branchName}`, {
      sha: newCommitResponse.data.sha,
    });

    console.log(`Committed to branch ${branchName}: ${message}`);
  } catch (err) {
    console.error('Failed to commit files:', err);
    throw err;
  }
}

export async function createPullRequest(options: CreatePROptions): Promise<CreatePRResult> {
  try {
    // Determine correct base branch (main or Main)
    let baseBranch = options.baseBranch || 'Main';

    // Get main branch SHA
    const mainSha = await getMainBranchSha();

    // Create feature branch
    await createBranch(options.branchName, mainSha);

    // Commit files
    await commitFiles(options.branchName, options.files, `feat: ${options.title}`);

    // Create PR
    const prResponse = await api.post(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls`, {
      title: options.title,
      body: options.body,
      head: options.branchName,
      base: baseBranch,
    });

    return {
      prUrl: prResponse.data.html_url,
      prNumber: prResponse.data.number,
      branchName: options.branchName,
    };
  } catch (err) {
    console.error('Failed to create pull request:', err);
    throw err;
  }
}

export async function addCommentToPR(prNumber: number, comment: string): Promise<void> {
  try {
    await api.post(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${prNumber}/comments`, {
      body: comment,
    });
    console.log(`Added comment to PR #${prNumber}`);
  } catch (err) {
    console.error('Failed to add comment to PR:', err);
    throw err;
  }
}
