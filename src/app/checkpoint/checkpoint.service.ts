import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class CheckpointService {
  private http = inject(HttpClient);

  getSession(sessionId: string): Observable<any> {
    return this.http.get<any>(`/api/sessions/${sessionId}`);
  }

  chat(sessionId: string, message: string): Observable<any> {
    const subject = new Subject<any>();

    const eventSource = new EventSource(
      `/api/chat?sessionId=${encodeURIComponent(sessionId)}&message=${encodeURIComponent(message)}`
    );

    eventSource.addEventListener('token', (event: any) => {
      const data = JSON.parse(event.data);
      subject.next({ type: 'token', token: data.token });
    });

    eventSource.addEventListener('assessment', (event: any) => {
      const data = JSON.parse(event.data);
      subject.next({ type: 'assessment', assessment: data });
    });

    eventSource.addEventListener('done', () => {
      eventSource.close();
      subject.complete();
    });

    eventSource.addEventListener('error', () => {
      eventSource.close();
      subject.error(new Error('Chat stream error'));
    });

    return subject.asObservable();
  }

  makeDecision(
    sessionId: string,
    decision: 'implement' | 'escalate' | 'cancel',
    notes?: string
  ): Observable<any> {
    return this.http.post<any>(`/api/checkpoint/${sessionId}`, {
      decision,
      notes,
    });
  }

  implementEasyTask(sessionId: string): Observable<any> {
    return this.http.post<any>('/api/implement-easy-task', {
      sessionId,
    });
  }

  generateIDEContext(sessionId: string): Observable<any> {
    return this.http.post<any>('/api/generate-context', {
      sessionId,
    });
  }
}
