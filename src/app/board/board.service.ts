import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Task {
  id: string;
  key: string;
  summary: string;
  status: 'Waiting for Approve' | 'In Progress' | 'Done';
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  assignee: string;
  type: 'Bug' | 'Story' | 'Task';
  createdAt: string;
  updatedAt: string;
  approval_status: string;
  jiraUrl?: string;
  sessionId: string;
}

@Injectable({
  providedIn: 'root',
})
export class BoardService {
  private http = inject(HttpClient);

  getTasks(): Observable<{ tasks: Task[] }> {
    return this.http.get<{ tasks: Task[] }>('/api/tasks-list');
  }
}
