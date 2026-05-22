import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap, forkJoin, of } from 'rxjs';

export interface LangfuseTrace {
  id: string;
  name: string;
  timestamp: string;
  userId: string;
  metadata: Record<string, unknown>;
  tags: string[];
  output: unknown;
}

export interface LangfuseObservation {
  id: string;
  traceId: string;
  name: string;
  type: string;
  startTime: string;
  endTime?: string;
  input: unknown;
  output: unknown;
  level?: string;
  model?: string;
  usage?: { input: number; output: number };
}

@Injectable({ providedIn: 'root' })
export class LangfuseService {
  private http = inject(HttpClient);

  private get headers(): HttpHeaders {
    const key = `${(window as any).__LANGFUSE_PUBLIC_KEY__}:${(window as any).__LANGFUSE_SECRET_KEY__}`;
    return new HttpHeaders({
      Authorization: `Basic ${btoa(key)}`,
      'Content-Type': 'application/json',
    });
  }

  getTraces(): Observable<LangfuseTrace[]> {
    return this.http
      .get<{ data: LangfuseTrace[] }>('/langfuse/api/public/traces?tags=agentic-workflow&limit=20', {
        headers: this.headers,
      })
      .pipe(map((r) => r.data ?? []));
  }

  getObservations(traceId: string): Observable<LangfuseObservation[]> {
    return this.http
      .get<{ data: LangfuseObservation[] }>(
        `/langfuse/api/public/observations?traceId=${traceId}`,
        { headers: this.headers }
      )
      .pipe(map((r) => r.data ?? []));
  }

  /**
   * Aggregates input + output token usage across all observations for all
   * traces tagged with `agentic-workflow` and returns the combined total.
   */
  getTotalTokensUsed(): Observable<number> {
    return this.getTraces().pipe(
      switchMap((traces) => {
        if (traces.length === 0) {
          return of([]);
        }
        return forkJoin(
          traces.map((trace) => this.getObservations(trace.id))
        );
      }),
      map((observationSets: LangfuseObservation[][]) =>
        observationSets.reduce((total, observations) => {
          const setTotal = observations.reduce((sum, obs) => {
            const inputTokens = obs.usage?.input ?? 0;
            const outputTokens = obs.usage?.output ?? 0;
            return sum + inputTokens + outputTokens;
          }, 0);
          return total + setTotal;
        }, 0)
      )
    );
  }
}
