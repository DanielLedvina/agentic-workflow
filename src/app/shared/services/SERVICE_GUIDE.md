# Service Architecture Guide

This document outlines the core services that power the agentic workflow UI, with implementation patterns and dependency management.

## Services Overview

### 1. AuthService
**Location**: `src/app/shared/services/auth.service.ts`

Manages authentication state and token lifecycle.

```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  isAuthenticated = signal(false);
  currentUser = signal<User | null>(null);
  token = signal<string | null>(null);

  login(password: string): Observable<AuthResponse> {
    // POST /api/auth/login with password
    // On success: set token signal, set isAuthenticated=true
    // On error: throw with descriptive message
  }

  logout(): void {
    // Clear token signal, set isAuthenticated=false
    // Optionally POST /api/auth/logout
  }

  getToken(): string {
    // Return current token for HTTP headers
  }

  isTokenValid(): boolean {
    // Check expiration
  }
}
```

**Usage in Guards**:
```typescript
@Injectable({ providedIn: 'root' })
export function authGuard(): CanActivateFn {
  return (route, state) => {
    const auth = inject(AuthService);
    if (auth.isAuthenticated()) return true;
    inject(Router).navigate(['/auth/login']);
    return false;
  };
}
```

---

### 2. SessionService
**Location**: `src/app/shared/services/session.service.ts`

Maintains in-memory workflow session state. Acts as a bridge between components and the backend API.

```typescript
@Injectable({ providedIn: 'root' })
export class SessionService {
  // Signals for reactive updates across components
  currentSession = signal<WorkflowSession | null>(null);
  messages = signal<Message[]>([]);
  allSessions = signal<WorkflowSession[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  constructor(private http: HttpClient) {}

  /**
   * Set current session and initialize messages
   * Called after creating new workflow or navigating to existing session
   */
  setCurrentSession(session: WorkflowSession): void {
    this.currentSession.set(session);
    this.messages.set(session.messages);
  }

  /**
   * Append message to current session
   * Used by workflow.service after receiving orchestrator responses
   */
  addMessage(message: Message): void {
    this.messages.update(msgs => [...msgs, message]);
    if (this.currentSession()) {
      this.currentSession.update(s => ({
        ...s,
        messages: this.messages(),
      }));
    }
  }

  /**
   * Fetch session from backend by ID
   */
  getSession(sessionId: string): Observable<WorkflowSession> {
    return this.http.get<WorkflowSession>(`/api/sessions/${sessionId}`)
      .pipe(
        tap(session => this.setCurrentSession(session)),
        catchError(e => {
          this.error.set('Failed to load session');
          throw e;
        }),
      );
  }

  /**
   * Create new session (initially empty)
   */
  createSession(repoUrl: string): Observable<WorkflowSession> {
    return this.http.post<WorkflowSession>('/api/sessions', { repoUrl })
      .pipe(
        tap(session => this.setCurrentSession(session)),
      );
  }

  /**
   * Update session status (e.g., analyzing → checkpoint)
   */
  updateSessionStatus(sessionId: string, status: SessionStatus): Observable<void> {
    return this.http.patch<void>(`/api/sessions/${sessionId}`, { status })
      .pipe(
        tap(() => {
          if (this.currentSession()?.id === sessionId) {
            this.currentSession.update(s => ({ ...s, status }));
          }
        }),
      );
  }

  /**
   * Fetch all sessions (for dashboard)
   */
  getAllSessions(): Observable<WorkflowSession[]> {
    this.loading.set(true);
    return this.http.get<WorkflowSession[]>('/api/sessions')
      .pipe(
        tap(sessions => {
          this.allSessions.set(sessions);
          this.loading.set(false);
        }),
        catchError(e => {
          this.error.set('Failed to load sessions');
          this.loading.set(false);
          throw e;
        }),
      );
  }

  /**
   * Computed: filter sessions by status
   */
  getSessionsByStatus(status: SessionStatus) {
    return computed(() => 
      this.allSessions().filter(s => s.status === status)
    );
  }
}
```

**Key Pattern**: Use signals to persist state; call API to sync with backend.

---

### 3. WorkflowService
**Location**: `src/app/shared/services/workflow.service.ts`

Communicates with the orchestrator API, handling streaming responses.

```typescript
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private http = inject(HttpClient);

  /**
   * Initialize workflow: send repo URL and get first message from orchestrator
   * Returns Observable that emits Message objects as they stream in
   */
  startWorkflow(sessionId: string, repoUrl: string): Observable<Message> {
    return this.http.post(
      `/api/sessions/${sessionId}/start`,
      { repoUrl },
      { responseType: 'text' }
    ).pipe(
      switchMap(response => this.parseStreamingResponse(response)),
    );
  }

  /**
   * Send user message to orchestrator, get streaming response
   * Called from checkpoint or create-ticket components
   */
  sendMessage(sessionId: string, userMessage: string): Observable<Message> {
    const req = { content: userMessage, role: 'user' as const };
    
    return this.http.post(
      `/api/sessions/${sessionId}/messages`,
      req,
      { responseType: 'text' }
    ).pipe(
      switchMap(response => this.parseStreamingResponse(response)),
    );
  }

  /**
   * Parse streaming response from server
   * Server sends chunks as "data: {json}\n"
   * Emits one Message per chunk, updating isStreaming flag
   */
  private parseStreamingResponse(response: string): Observable<Message> {
    const lines = response.split('\n').filter(l => l.trim());
    
    return from(lines).pipe(
      map(line => {
        if (!line.startsWith('data: ')) return null;
        const json = JSON.parse(line.slice(6));
        return {
          id: json.messageId || generateId(),
          role: 'assistant',
          content: json.content || json.delta || '',
          isStreaming: !json.isComplete,
          timestamp: new Date(json.timestamp),
          tokenCount: json.totalTokens ? { input: 0, output: json.totalTokens } : undefined,
        } as Message;
      }),
      filter((msg): msg is Message => msg !== null),
    );
  }

  /**
   * Check difficulty assessment after conversation
   * Called from checkpoint component
   */
  checkDifficulty(sessionId: string): Observable<DifficultyAssessment> {
    return this.http.post<DifficultyAssessment>(
      `/api/sessions/${sessionId}/assess-difficulty`,
      {}
    );
  }

  /**
   * Auto-implement (simple tickets)
   * Streams implementation progress
   */
  autoImplement(sessionId: string): Observable<ImplementationResult> {
    return this.http.post(
      `/api/sessions/${sessionId}/auto-implement`,
      {},
      { responseType: 'text' }
    ).pipe(
      switchMap(response => this.parseImplementationResponse(response)),
    );
  }

  /**
   * Prepare for IDE (complex tickets)
   * Returns file changes and instructions
   */
  prepareForIde(sessionId: string): Observable<IdeModePayload> {
    return this.http.post<IdeModePayload>(
      `/api/sessions/${sessionId}/prepare-ide`,
      {}
    );
  }

  /**
   * Parse implementation progress from streaming response
   */
  private parseImplementationResponse(response: string): Observable<ImplementationResult> {
    const json = JSON.parse(response);
    return of(json);
  }
}
```

**Key Pattern**: Use `switchMap()` to flatten streaming responses into individual message emissions.

---

### 4. GitHubContextService
**Location**: `src/app/shared/services/github-context.service.ts`

Fetches and caches GitHub repository structure and relevant files.

```typescript
@Injectable({ providedIn: 'root' })
export class GitHubContextService {
  private http = inject(HttpClient);
  private contextCache = new Map<string, GitHubContext>();

  isAnalyzing = signal(false);

  /**
   * Analyze repository and return structure + key files
   * Caches result by repo URL to avoid refetching
   */
  analyzeRepository(repoUrl: string): Observable<GitHubContext> {
    if (this.contextCache.has(repoUrl)) {
      return of(this.contextCache.get(repoUrl)!);
    }

    this.isAnalyzing.set(true);
    return this.http.post<GitHubContext>(
      '/api/github/analyze',
      { repoUrl }
    ).pipe(
      tap(context => {
        this.contextCache.set(repoUrl, context);
        this.isAnalyzing.set(false);
      }),
      catchError(e => {
        this.isAnalyzing.set(false);
        throw e;
      }),
    );
  }

  /**
   * Get file content (lazy load on demand)
   */
  getFileContent(repoUrl: string, filePath: string): Observable<string> {
    return this.http.post<{ content: string }>(
      '/api/github/file-content',
      { repoUrl, filePath }
    ).pipe(map(res => res.content));
  }

  /**
   * Get tree structure for file browser
   */
  getRepositoryTree(repoUrl: string): Observable<GitHubTreeNode> {
    return this.http.post<GitHubTreeNode>(
      '/api/github/tree',
      { repoUrl }
    );
  }

  clearCache(): void {
    this.contextCache.clear();
  }
}
```

---

### 5. JiraService
**Location**: `src/app/shared/services/jira.service.ts`

Creates and updates Jira tasks, manages task URLs.

```typescript
@Injectable({ providedIn: 'root' })
export class JiraService {
  private http = inject(HttpClient);

  /**
   * Create new Jira task from workflow session
   */
  createTask(req: JiraCreateRequest): Observable<JiraTask> {
    return this.http.post<JiraTask>('/api/jira/tasks', req);
  }

  /**
   * Get existing task
   */
  getTask(taskId: string): Observable<JiraTask> {
    return this.http.get<JiraTask>(`/api/jira/tasks/${taskId}`);
  }

  /**
   * Update task (status, comments, etc.)
   */
  updateTask(taskId: string, updates: Partial<JiraTask>): Observable<void> {
    return this.http.patch<void>(`/api/jira/tasks/${taskId}`, updates);
  }

  /**
   * Add comment to task
   */
  addComment(taskId: string, comment: string): Observable<void> {
    return this.http.post<void>(
      `/api/jira/tasks/${taskId}/comments`,
      { content: comment }
    );
  }
}
```

---

### 6. HTTP Interceptor for Auth
**Location**: `src/app/shared/interceptors/auth.interceptor.ts`

Automatically adds bearer token to all HTTP requests.

```typescript
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const token = this.auth.getToken();
    if (token) {
      req = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
    }
    return next.handle(req).pipe(
      catchError(err => {
        if (err.status === 401) {
          this.auth.logout();
          inject(Router).navigate(['/auth/login']);
        }
        throw err;
      }),
    );
  }
}
```

**Register in `app.config.ts`**:
```typescript
export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withInterceptors([authInterceptor])
    ),
  ],
};
```

---

## Dependency Injection Pattern

### Component Usage

```typescript
export class CreateTicketComponent {
  private session = inject(SessionService);
  private workflow = inject(WorkflowService);
  private github = inject(GitHubContextService);
  private jira = inject(JiraService);
  private router = inject(Router);

  // Signals from services
  isAnalyzing = this.github.isAnalyzing;

  onAnalyzeRepo(repoUrl: string) {
    this.github.analyzeRepository(repoUrl).subscribe({
      next: (context) => {
        const newSession = {
          id: generateId(),
          repoUrl,
          context,
          messages: [],
          status: 'analyzing' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        this.session.setCurrentSession(newSession);
        this.startWorkflow();
      },
      error: (e) => console.error(e),
    });
  }

  private startWorkflow() {
    this.workflow.startWorkflow(
      this.session.currentSession()!.id,
      this.session.currentSession()!.repoUrl
    ).subscribe({
      next: (msg) => this.session.addMessage(msg),
      error: (e) => console.error(e),
    });
  }
}
```

---

## Error Handling Strategy

### Service-Level Error Handling
```typescript
// In WorkflowService
sendMessage(sessionId: string, message: string): Observable<Message> {
  return this.http.post(...).pipe(
    catchError(err => {
      if (err.status === 400) {
        return throwError(() => new Error('Invalid request'));
      }
      if (err.status === 503) {
        return throwError(() => new Error('Service temporarily unavailable'));
      }
      return throwError(() => new Error('Unknown error'));
    }),
  );
}
```

### Component-Level Error Handling
```typescript
onSendMessage(text: string) {
  this.isLoading.set(true);
  this.workflow.sendMessage(sessionId, text).subscribe({
    next: (msg) => this.addMessage(msg),
    error: (e) => {
      this.error.set(e.message);
      this.isLoading.set(false);
    },
    complete: () => this.isLoading.set(false),
  });
}
```

---

## Caching Strategy

### SessionService: In-Memory Caching
- `currentSession` signal: always up-to-date
- `allSessions` signal: refreshed on demand (dashboard component)
- Invalidation: when user navigates or API returns 401 (clear on logout)

### GitHubContextService: URL-Based Caching
```typescript
private contextCache = new Map<string, GitHubContext>();

// Check cache before API call
if (this.contextCache.has(repoUrl)) {
  return of(this.contextCache.get(repoUrl)!);
}
```

---

## Testing Services

### Mock AuthService
```typescript
const mockAuthService = {
  isAuthenticated: signal(true),
  login: jasmine.createSpy('login').and.returnValue(of({ token: 'test' })),
  logout: jasmine.createSpy('logout'),
  getToken: jasmine.createSpy('getToken').and.returnValue('test-token'),
};

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: mockAuthService },
    ],
  });
});
```

### Mock SessionService
```typescript
const mockSessionService = {
  currentSession: signal(testSession),
  messages: signal([]),
  addMessage: jasmine.createSpy('addMessage'),
  setCurrentSession: jasmine.createSpy('setCurrentSession'),
};
```

---

## Summary

| Service | Responsibility | Key Methods | State Type |
|---------|---|---|---|
| AuthService | Login/logout, token management | login(), logout(), getToken() | Signals |
| SessionService | Session CRUD, message tracking | setCurrentSession(), addMessage(), getSession() | Signals + Observables |
| WorkflowService | Orchestrator API communication | startWorkflow(), sendMessage(), checkDifficulty() | Observables |
| GitHubContextService | Repo analysis, file fetching | analyzeRepository(), getFileContent() | Observables + Cache |
| JiraService | Task CRUD | createTask(), getTask(), updateTask() | Observables |

All services use **Observables for async operations** and **Signals for shared state**.
