import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, of } from 'rxjs';

export interface Agent {
  id: string;
  name: string;
  sessions: number;
  tokensSpent: number;
  systemPrompt: string;
}

export interface CreateAgentPayload {
  name: string;
  systemPrompt: string;
}

export interface UpdateAgentPayload {
  name?: string;
  sessions?: number;
  tokensSpent?: number;
  systemPrompt?: string;
}

@Injectable({ providedIn: 'root' })
export class AgentsService {
  private http = inject(HttpClient);

  private get headers(): HttpHeaders {
    const key = `${(window as any).__LANGFUSE_PUBLIC_KEY__}:${(window as any).__LANGFUSE_SECRET_KEY__}`;
    return new HttpHeaders({
      Authorization: `Basic ${btoa(key)}`,
      'Content-Type': 'application/json',
    });
  }

  private mapTraceToAgent(trace: any): Agent {
    const metadata = trace.metadata ?? {};
    return {
      id: trace.id,
      name: trace.name ?? 'Unknown Agent',
      sessions: typeof metadata['sessions'] === 'number' ? metadata['sessions'] : 0,
      tokensSpent: typeof metadata['tokensSpent'] === 'number' ? metadata['tokensSpent'] : 0,
      systemPrompt: typeof metadata['systemPrompt'] === 'string' ? metadata['systemPrompt'] : '',
    };
  }

  getAgents(): Observable<Agent[]> {
    return this.http
      .get<{ data: any[] }>('/langfuse/api/public/traces?tags=agent&limit=50', {
        headers: this.headers,
      })
      .pipe(
        map((r) => (r.data ?? []).map((trace) => this.mapTraceToAgent(trace)))
      );
  }

  createAgent(payload: CreateAgentPayload): Observable<Agent> {
    const body = {
      name: payload.name,
      tags: ['agent'],
      metadata: {
        systemPrompt: payload.systemPrompt,
        sessions: 0,
        tokensSpent: 0,
      },
    };
    return this.http
      .post<{ id: string; name: string; metadata: Record<string, unknown>; tags: string[] }>(
        '/langfuse/api/public/traces',
        body,
        { headers: this.headers }
      )
      .pipe(
        map((trace) => this.mapTraceToAgent(trace))
      );
  }

  updateAgent(id: string, payload: UpdateAgentPayload): Observable<Agent> {
    const metadataUpdates: Record<string, unknown> = {};
    if (payload.sessions !== undefined) {
      metadataUpdates['sessions'] = payload.sessions;
    }
    if (payload.tokensSpent !== undefined) {
      metadataUpdates['tokensSpent'] = payload.tokensSpent;
    }
    if (payload.systemPrompt !== undefined) {
      metadataUpdates['systemPrompt'] = payload.systemPrompt;
    }

    const body: Record<string, unknown> = {
      metadata: metadataUpdates,
    };
    if (payload.name !== undefined) {
      body['name'] = payload.name;
    }

    return this.http
      .patch<{ id: string; name: string; metadata: Record<string, unknown>; tags: string[] }>(
        `/langfuse/api/public/traces/${id}`,
        body,
        { headers: this.headers }
      )
      .pipe(
        map((trace) => this.mapTraceToAgent(trace))
      );
  }
}
