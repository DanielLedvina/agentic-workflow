import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface GeneratedFile {
  path: string;
  content: string;
  changeType: 'create' | 'modify' | 'delete';
}

export interface CodeGenerationResult {
  files: GeneratedFile[];
  summary: string;
  notes: string;
}

export async function generateCode(
  taskDescription: string,
  orchestratorPlan: any,
  conversationHistory: any[],
  repoContext: any
): Promise<CodeGenerationResult> {
  try {
    const systemPrompt = `You are a code generation expert. Based on the task, orchestrator plan, and repository context, generate complete, production-ready code.

## Repository Context
**Tech Stack:** ${repoContext.technologies?.join(', ') || 'TypeScript/Node.js'}
**Project:** ${repoContext.summary || 'Web project'}

## Guidelines
1. Generate COMPLETE files with no placeholders or TODOs
2. Follow existing code patterns and conventions
3. Include proper imports and dependencies
4. Add basic error handling
5. Keep changes focused and minimal
6. Return ONLY valid, compilable code

## Response Format
Return a JSON object with:
{
  "files": [
    {
      "path": "src/app/component.ts",
      "content": "full file content here",
      "changeType": "create|modify|delete"
    }
  ],
  "summary": "brief description of changes",
  "notes": "any important notes"
}`;

    const messages = [
      ...conversationHistory.map((msg: any) => ({
        role: msg.role === 'orchestrator' ? 'assistant' : 'user',
        content: msg.content,
      })),
      {
        role: 'user' as const,
        content: `Generate the implementation code for this task:

**Task:** ${taskDescription}

**Orchestrator Plan:**
${JSON.stringify(orchestratorPlan, null, 2)}

Return ONLY a valid JSON object with the files array. No markdown, no explanation outside JSON.`,
      },
    ];

    console.log('Calling Claude API for code generation...');
    const response = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 4000,
      system: systemPrompt,
      messages,
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]) as CodeGenerationResult;

    // Validate files
    if (!Array.isArray(result.files)) {
      throw new Error('Invalid files array in response');
    }

    console.log(`Generated ${result.files.length} files`);
    return result;
  } catch (err) {
    console.error('Code generation error:', err);
    throw err;
  }
}
