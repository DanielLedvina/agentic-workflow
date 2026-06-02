import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';

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
    const publicKey = (window as any).__LANGFUSE_PUBLIC_KEY__;
    const secretKey = (window as any).__LANGFUSE_SECRET_KEY__;

    if (!publicKey || !secretKey) {
      throw new Error('Langfuse credentials not configured');
    }

    const key = `${publicKey}:${secretKey}`;
    return new HttpHeaders({
      Authorization: `Basic ${btoa(key)}`,
      'Content-Type': 'application/json',
    });
  }

  getTraces(): Observable<LangfuseTrace[]> {
    try {
      return this.http
        .get<{ data: LangfuseTrace[] }>('/langfuse/api/public/traces?tags=agentic-workflow&limit=20', {
          headers: this.headers,
        })
        .pipe(
          map((r) => r.data ?? []),
          catchError((err) => {
            console.warn('Langfuse not available:', err);
            return of([]);
          })
        );
    } catch (err) {
      console.warn('Langfuse credentials missing:', err);
      return of([]);
    }
  }

  getObservations(traceId: string): Observable<LangfuseObservation[]> {
    try {
      return this.http
        .get<{ data: LangfuseObservation[] }>(
          `/langfuse/api/public/observations?traceId=${traceId}`,
          { headers: this.headers }
        )
        .pipe(
          map((r) => r.data ?? []),
          catchError((err) => {
            console.warn('Failed to load observations:', err);
            return of([]);
          })
        );
    } catch (err) {
      return of([]);
    }
  }
}
