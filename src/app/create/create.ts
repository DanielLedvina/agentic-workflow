import {
  Component,
  OnInit,
  signal,
  inject,
  effect,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { CreateService } from './create.service';
import { AuthService } from '../shared/services/auth.service';

interface Message {
  id: string;
  role: 'user' | 'orchestrator';
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-create',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './create.html',
  styleUrl: './create.scss',
})
export class Create implements OnInit {
  private createService = inject(CreateService);
  private authService = inject(AuthService);
  private router = inject(Router);

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  // Form inputs
  jiraTitle = signal('');
  messageInput = signal('');

  // State
  sessionId = signal<string | null>(null);
  messages = signal<Message[]>([]);
  loading = signal(false);
  streaming = signal(false);
  error = signal<string | null>(null);
  orchestratorPlan = signal<any | null>(null);
  planReady = signal(false);

  // Derived states
  creatingTask = signal(false);
  taskCreated = signal(false);

  ngOnInit(): void {
    // Check if authenticated
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    // Create new session
    this.initializeSession();

    // Auto-scroll to bottom on new messages
    effect(() => {
      this.messages();
      setTimeout(() => this.scrollToBottom(), 0);
    });
  }

  private initializeSession(): void {
    this.loading.set(true);
    this.createService.createSession({}).subscribe({
      next: (session) => {
        this.sessionId.set(session.id);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to create session. Please refresh and try again.');
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
    this.createService.chat(this.sessionId()!, message).subscribe({
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
        } else if (chunk.type === 'plan') {
          this.orchestratorPlan.set(chunk.plan);
          this.planReady.set(true);
        }
      },
      error: (err) => {
        this.error.set('Failed to get response from orchestrator. Please try again.');
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

  createTask(): void {
    const title = this.jiraTitle().trim();
    if (!title || !this.sessionId() || !this.orchestratorPlan()) {
      return;
    }

    this.creatingTask.set(true);
    this.error.set(null);

    this.createService.createJiraTask(this.sessionId()!, title).subscribe({
      next: (result) => {
        this.taskCreated.set(true);
        this.creatingTask.set(false);
        // Redirect to checkpoint page after task created
        setTimeout(() => {
          this.router.navigate(['/checkpoint', this.sessionId()]);
        }, 1500);
      },
      error: (err) => {
        this.error.set('Failed to create Jira task. Please try again.');
        this.creatingTask.set(false);
      },
    });
  }

  private scrollToBottom(): void {
    if (this.messagesContainer?.nativeElement) {
      this.messagesContainer.nativeElement.scrollTop =
        this.messagesContainer.nativeElement.scrollHeight;
    }
  }
}
