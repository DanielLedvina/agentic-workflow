import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class CreateService {
  private http = inject(HttpClient);

  createSession(data: any): Observable<any> {
    return this.http.post<any>('/api/sessions', data);
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

    eventSource.addEventListener('plan', (event: any) => {
      const data = JSON.parse(event.data);
      subject.next({ type: 'plan', plan: data });
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

  createJiraTask(sessionId: string, title: string): Observable<any> {
    return this.http.post<any>('/api/jira', {
      sessionId,
      title,
    });
  }

  getSession(sessionId: string): Observable<any> {
    return this.http.get<any>(`/api/sessions/${sessionId}`);
  }
}
