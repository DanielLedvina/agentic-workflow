import {
  Component,
  OnInit,
  signal,
  inject,
  effect,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CheckpointService } from './checkpoint.service';

interface Message {
  id: string;
  role: 'user' | 'orchestrator';
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-checkpoint',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './checkpoint.html',
  styleUrl: './checkpoint.scss',
})
export class Checkpoint implements OnInit {
  private checkpointService = inject(CheckpointService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  sessionId = signal<string | null>(null);
  session = signal<any | null>(null);
  messages = signal<Message[]>([]);
  loading = signal(true);
  streaming = signal(false);
  error = signal<string | null>(null);

  // Difficulty assessment
  difficulty = signal<'easy' | 'hard' | null>(null);
  difficultyReason = signal('');

  // Developer decision
  messageInput = signal('');
  decision = signal<'implement' | 'escalate' | null>(null);
  decidingTask = signal(false);
  decisionNotes = signal('');

  // Copy to IDE
  contextReady = signal(false);
  contextCopied = signal(false);
  ideContext = signal<string | null>(null);
  generatingContext = signal(false);

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const id = params['sessionId'];
      this.sessionId.set(id);
      this.loadSession(id);
    });

    // Auto-scroll to bottom on new messages
    effect(() => {
      this.messages();
      setTimeout(() => this.scrollToBottom(), 0);
    });
  }

  private loadSession(sessionId: string): void {
    this.loading.set(true);
    this.checkpointService.getSession(sessionId).subscribe({
      next: (session) => {
        this.session.set(session);
        this.messages.set(session.messages || []);

        // Extract difficulty from orchestrator plan if available
        if (session.orchestrator_plan) {
          this.difficulty.set(session.orchestrator_plan.difficulty || 'hard');
          this.difficultyReason.set(session.orchestrator_plan.summary || '');
        }

        // Check if context for IDE is ready (for hard tasks)
        if (this.difficulty() === 'hard') {
          this.contextReady.set(true);
        }

        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load session. Please try again.');
        this.loading.set(false);
      },
    });
  }

  sendMessage(): void {
    const message = this.messageInput().trim();
    if (!message || !this.sessionId() || this.streaming()) {
      return;
    }

    // Add user message to UI immediately
    const userMsg: Message = {
      id: Math.random().toString(),
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    this.messages.update((msgs) => [...msgs, userMsg]);
    this.messageInput.set('');

    // Stream orchestrator response
    this.streaming.set(true);
    this.error.set(null);

    let fullResponse = '';
    this.checkpointService.chat(this.sessionId()!, message).subscribe({
      next: (chunk) => {
        if (chunk.type === 'token') {
          fullResponse += chunk.token;
          // Update last orchestrator message with streaming content
          this.messages.update((msgs) => {
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg && lastMsg.role === 'orchestrator') {
              lastMsg.content = fullResponse;
              return [...msgs];
            }
            return msgs;
          });
        } else if (chunk.type === 'assessment') {
          this.difficulty.set(chunk.assessment.difficulty);
          this.difficultyReason.set(chunk.assessment.reason);
          if (chunk.assessment.difficulty === 'hard') {
            this.contextReady.set(true);
          }
        }
      },
      error: (err) => {
        this.error.set('Failed to get response. Please try again.');
        this.streaming.set(false);
      },
      complete: () => {
        // Add final orchestrator message if not already added
        if (!this.messages().find((m) => m.role === 'orchestrator' && m.content === fullResponse)) {
          const orchMsg: Message = {
            id: Math.random().toString(),
            role: 'orchestrator',
            content: fullResponse,
            timestamp: new Date(),
          };
          this.messages.update((msgs) => [...msgs, orchMsg]);
        }
        this.streaming.set(false);
      },
    });
  }

  approveAndImplement(): void {
    if (!this.sessionId()) return;

    this.decidingTask.set(true);
    this.error.set(null);

    // First, generate and create PR
    this.checkpointService.implementEasyTask(this.sessionId()!).subscribe({
      next: (result) => {
        this.decision.set('implement');

        // Update session status
        this.checkpointService.makeDecision(this.sessionId()!, 'implement').subscribe({
          next: () => {
            // Redirect to dashboard after success
            setTimeout(() => {
              this.router.navigate(['/dashboard']);
            }, 2000);
          },
          error: (err) => {
            console.error('Failed to update decision:', err);
            // Don't fail - PR was created successfully
            setTimeout(() => {
              this.router.navigate(['/dashboard']);
            }, 2000);
          },
        });
      },
      error: (err) => {
        this.error.set('Failed to create PR. Please try again.');
        this.decidingTask.set(false);
      },
    });
  }

  escalateToIde(): void {
    if (!this.sessionId()) return;

    this.decidingTask.set(true);
    this.error.set(null);

    // First generate context
    this.generatingContext.set(true);
    this.checkpointService.generateIDEContext(this.sessionId()!).subscribe({
      next: (result) => {
        this.ideContext.set(result.context);
        this.generatingContext.set(false);

        // Then record decision
        this.checkpointService
          .makeDecision(this.sessionId()!, 'escalate', this.decisionNotes())
          .subscribe({
            next: () => {
              this.decision.set('escalate');
              this.contextReady.set(true);
              this.decidingTask.set(false);
            },
            error: (err) => {
              this.error.set('Failed to record decision. Context is ready.');
              this.decidingTask.set(false);
              // Still show context even if decision recording fails
              this.contextReady.set(true);
            },
          });
      },
      error: (err) => {
        this.error.set('Failed to generate context. Please try again.');
        this.generatingContext.set(false);
        this.decidingTask.set(false);
      },
    });
  }

  copyContextToClipboard(): void {
    const contextText = this.ideContext() || this.generateContextForIde();
    navigator.clipboard.writeText(contextText).then(() => {
      this.contextCopied.set(true);
      setTimeout(() => this.contextCopied.set(false), 2000);
    });
  }

  private generateContextForIde(): string {
    const session = this.session();
    const messages = this.messages();

    return `# Task Context for IDE

## Jira Task
${session?.ticket_key || 'Not yet created'}: ${session?.orchestrator_plan?.summary || ''}

## Conversation History
${messages.map((m) => `### ${m.role === 'user' ? 'Developer' : 'Orchestrator'}\n${m.content}`).join('\n\n')}

## Implementation Plan
${session?.orchestrator_plan?.agents ? session.orchestrator_plan.agents.map((a: any) => `### ${a.name}\n${a.task}\nFiles: ${a.files?.join(', ')}`).join('\n\n') : 'No plan available'}

## Difficulty Assessment
${this.difficulty() === 'hard' ? 'Hard task - Requires developer expertise' : 'Easy task'}
${this.difficultyReason()}`;
  }

  private scrollToBottom(): void {
    if (this.messagesContainer?.nativeElement) {
      this.messagesContainer.nativeElement.scrollTop =
        this.messagesContainer.nativeElement.scrollHeight;
    }
  }
}
