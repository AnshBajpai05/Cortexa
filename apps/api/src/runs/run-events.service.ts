import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

/**
 * In-memory pub/sub for live run events, keyed by workflowId.
 * The worker → internal webhook publishes node status changes here, and the
 * SSE endpoint (GET /runs/events/:workflowId) streams them to the canvas.
 *
 * In-memory is fine for local-first / single-instance. For multi-instance,
 * swap the Subject for a Redis pub/sub channel (same interface).
 */
@Injectable()
export class RunEventsService {
  private channels = new Map<string, Subject<any>>();

  private channel(workflowId: string): Subject<any> {
    let s = this.channels.get(workflowId);
    if (!s) {
      s = new Subject<any>();
      this.channels.set(workflowId, s);
    }
    return s;
  }

  /** Publish a node/run event to all SSE subscribers of this workflow. */
  publish(workflowId: string, data: Record<string, unknown>): void {
    this.channel(workflowId).next({ ...data, ts: Date.now() });
  }

  /** Observable stream of events for a workflow. */
  stream(workflowId: string): Observable<any> {
    return this.channel(workflowId).asObservable();
  }
}
