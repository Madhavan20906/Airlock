import { TaskInput, TaskComplexity, RoutingPolicy } from '../types.js';

export function calculateComplexity(task: TaskInput, policy: RoutingPolicy): TaskComplexity {
  const charLength = (task.instruction?.length || 0) + (task.content?.length || 0);

  if (charLength >= policy.complexity.highCharCount) {
    return 'high';
  }

  if (task.taskType === 'qa' && charLength > 3000) {
    return 'high';
  }

  if (charLength <= 1500 && (task.taskType === 'summarize' || task.taskType === 'extract' || task.taskType === 'translate')) {
    return 'low';
  }

  return 'medium';
}
