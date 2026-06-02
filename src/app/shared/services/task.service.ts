import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';

export interface Task {
  id: string;
  sessionId: string;
  title: string;
  status: 'new' | 'in_progress' | 'done';
  jiraKey?: string;
  jiraUrl?: string;
  prUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private http = inject(HttpClient);
  private tasksSubject = new BehaviorSubject<Task[]>([]);
  tasks$ = this.tasksSubject.asObservable();

  constructor() {
    this.loadTasks();
  }

  private loadTasks() {
    // Load from DB
    this.http.get<any>('/api/tasks-list').subscribe({
      next: (response: any) => {
        const tasks = (response.tasks || []).map((t: any) => ({
          id: t.id,
          sessionId: t.id,
          title: t.jira_key || 'Unknown',
          status: this.mapDbStatus(t.approval_status),
          jiraKey: t.jira_key,
          jiraUrl: t.jira_url,
          prUrl: t.pr_url,
          createdAt: new Date(t.created_at),
          updatedAt: new Date(t.updated_at),
        }));
        this.tasksSubject.next(tasks);
      },
      error: (err) => {
        console.warn('Failed to load tasks from DB, falling back to localStorage:', err);
        this.loadFromLocalStorage();
      },
    });
  }

  private loadFromLocalStorage() {
    const stored = localStorage.getItem('tasks');
    if (stored) {
      try {
        const tasks = JSON.parse(stored);
        this.tasksSubject.next(tasks);
      } catch (e) {
        console.error('Failed to load tasks from localStorage:', e);
      }
    }
  }

  private mapDbStatus(dbStatus: string | null): Task['status'] {
    if (!dbStatus) return 'new';
    if (dbStatus.includes('approved_easy') || dbStatus.includes('approved_hard')) return 'in_progress';
    if (dbStatus.includes('implemented')) return 'done';
    return 'new';
  }

  private saveTasks(tasks: Task[]) {
    localStorage.setItem('tasks', JSON.stringify(tasks));
    this.tasksSubject.next(tasks);
  }

  addTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
    const newTask: Task = {
      ...task,
      id: Math.random().toString(36).substring(7),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tasks = this.tasksSubject.value;
    this.saveTasks([...tasks, newTask]);
    return newTask;
  }

  updateTask(id: string, updates: Partial<Task>) {
    const tasks = this.tasksSubject.value.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: new Date() } : t
    );
    this.saveTasks(tasks);
  }

  updateTaskBySessionId(sessionId: string, updates: Partial<Task>) {
    const tasks = this.tasksSubject.value.map((t) =>
      t.sessionId === sessionId ? { ...t, ...updates, updatedAt: new Date() } : t
    );
    this.saveTasks(tasks);
  }

  getTasksByStatus(status: Task['status']): Observable<Task[]> {
    return new Observable((subscriber) => {
      this.tasks$.subscribe((tasks) => {
        subscriber.next(tasks.filter((t) => t.status === status));
      });
    });
  }

  getTasks(): Task[] {
    return this.tasksSubject.value;
  }

  deleteTask(id: string) {
    const tasks = this.tasksSubject.value.filter((t) => t.id !== id);
    this.saveTasks(tasks);
  }
}
