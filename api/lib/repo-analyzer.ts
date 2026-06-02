import * as fs from 'fs';
import * as path from 'path';

export interface RepoAnalysis {
  technologies: string[];
  summary: string;
  files: Array<{ path: string; language?: string }>;
  structure: any[];
}

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.angular',
  'dist',
  'build',
  '.next',
  '.venv',
  '__pycache__',
  '.pytest_cache',
  '.vercel',
]);

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.json': 'JSON',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sql': 'SQL',
  '.py': 'Python',
  '.java': 'Java',
  '.go': 'Go',
  '.rs': 'Rust',
  '.sh': 'Bash',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.md': 'Markdown',
};

function getLanguage(filename: string): string | undefined {
  const ext = path.extname(filename).toLowerCase();
  return LANGUAGE_MAP[ext];
}

function scanFiles(dir: string, maxDepth: number = 2, currentDepth: number = 0): Array<{ path: string; language?: string }> {
  const files: Array<{ path: string; language?: string }> = [];

  if (currentDepth > maxDepth) return files;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      if (entry.isFile()) {
        files.push({
          path: relativePath,
          language: getLanguage(entry.name),
        });
      } else if (entry.isDirectory() && currentDepth < maxDepth) {
        const subfiles = scanFiles(fullPath, maxDepth, currentDepth + 1);
        files.push(...subfiles);
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dir}:`, err);
  }

  return files;
}

function detectTechnologies(baseDir: string): string[] {
  const detected = new Set<string>();

  try {
    // Check for key files
    const keyFiles = {
      'angular.json': 'Angular',
      'vue.config.js': 'Vue',
      'vite.config.ts': 'Vite',
      'next.config.js': 'Next.js',
      'Dockerfile': 'Docker',
      'docker-compose.yml': 'Docker',
      'vercel.json': 'Vercel',
    };

    for (const [file, tech] of Object.entries(keyFiles)) {
      if (fs.existsSync(path.join(baseDir, file))) {
        detected.add(tech);
      }
    }

    // Check package.json dependencies
    const packageJsonPath = path.join(baseDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const pkgJson = JSON.parse(content);
      const allDeps = {
        ...(pkgJson.dependencies || {}),
        ...(pkgJson.devDependencies || {}),
      };

      const depMap: Record<string, string> = {
        '@angular/core': 'Angular',
        'react': 'React',
        'vue': 'Vue',
        'next': 'Next.js',
        'typescript': 'TypeScript',
        'express': 'Express',
        '@nestjs/core': 'NestJS',
        'pg': 'PostgreSQL',
        '@vercel/postgres': 'PostgreSQL',
        'mongodb': 'MongoDB',
        'mongoose': 'MongoDB',
        '@anthropic-ai/sdk': 'Anthropic SDK',
        'axios': 'Axios',
        'langfuse': 'Langfuse',
      };

      for (const [dep, tech] of Object.entries(depMap)) {
        if (allDeps[dep]) {
          detected.add(tech);
        }
      }
    }
  } catch (err) {
    console.error('Error detecting technologies:', err);
  }

  return Array.from(detected).sort();
}

function getProjectSummary(baseDir: string): string {
  try {
    const packageJsonPath = path.join(baseDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const content = fs.readFileSync(packageJsonPath, 'utf-8');
      const pkgJson = JSON.parse(content);
      return pkgJson.description || `Project: ${pkgJson.name || 'Unknown'}`;
    }
  } catch (err) {
    console.error('Error reading project summary:', err);
  }

  return 'Node.js / TypeScript project';
}

export async function analyzeRepository(baseDir: string = process.cwd()): Promise<RepoAnalysis> {
  try {
    const files = scanFiles(baseDir, 2);
    const technologies = detectTechnologies(baseDir);
    const summary = getProjectSummary(baseDir);

    // Filter to most relevant files
    const relevantFiles = files
      .filter((f) => {
        const name = path.basename(f.path);
        return !name.startsWith('.');
      })
      .slice(0, 25);

    return {
      technologies,
      summary,
      files: relevantFiles,
      structure: [],
    };
  } catch (err) {
    console.error('Repository analysis error:', err);
    return {
      technologies: [],
      summary: 'Error analyzing repository',
      files: [],
      structure: [],
    };
  }
}
