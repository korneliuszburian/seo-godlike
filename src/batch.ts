export interface BatchTask {
  id: string;
  run: () => Promise<void>;
}

export interface BatchFailure {
  id: string;
  error: string;
}

export interface BatchResult {
  completed: string[];
  failed: BatchFailure[];
}

export async function runSequentialBatch(tasks: BatchTask[]): Promise<BatchResult> {
  const completed: string[] = [];
  const failed: BatchFailure[] = [];
  for (const task of tasks) {
    try {
      await task.run();
      completed.push(task.id);
    } catch (error: unknown) {
      failed.push({ id: task.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { completed, failed };
}
