"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Task, TaskFormData, Subtask } from "@/components/todos/types";
import api from "@/lib/api";

type TasksContextType = {
  tasks: Task[];
  createTask: (data: TaskFormData) => Promise<void>;
  updateTask: (id: string, data: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleSubtask: (taskId: string, subtaskId: string) => Promise<void>;
};

const TasksContext = createContext<TasksContextType | undefined>(undefined);

// Helper to fetch all todos and their subtasks from backend
async function fetchTasksFromBackend(): Promise<Task[]> {
  const res = await api.get("/todos/");
  const todos = res.data;

  const tasks = await Promise.all(
    todos.map(async (todo: any) => {
      let subtasks: Subtask[] = [];
      try {
        const subRes = await api.get(`/todos/${todo.id}/subtasks`);
        subtasks = subRes.data.map((sub: any) => ({
          id: sub.id,
          title: sub.title,
          done: sub.completed,
        }));
      } catch (err) {
        console.error(`Failed to fetch subtasks for todo ${todo.id}:`, err);
      }

      return {
        id: todo.id,
        title: todo.title,
        description: todo.description || "",
        priority: todo.priority,
        status: todo.completed ? "done" : "todo",
        dueDate: todo.due_date ? todo.due_date.split("T")[0] : "",
        tags: [],
        subtasks,
        createdAt: todo.created_at,
      } as Task;
    })
  );

  return tasks;
}

export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refreshTasks = async () => {
    try {
      const fetched = await fetchTasksFromBackend();
      setTasks(fetched);
      setLoaded(true);
    } catch (error) {
      console.error("Error fetching tasks from backend:", error);
    }
  };

  useEffect(() => {
    refreshTasks();
  }, []);

  const value = useMemo(
    () => ({
      tasks,
      createTask: async (data: TaskFormData) => {
        try {
          const res = await api.post("/todos/", {
            title: data.title,
            description: data.description || "",
            due_date: data.dueDate ? `${data.dueDate}T00:00:00Z` : null,
            priority: data.priority,
            reminder_time: null,
          });
          const newTodo = res.data;

          if (data.subtasks && data.subtasks.length > 0) {
            await Promise.all(
              data.subtasks.map((sub) =>
                api.post(`/todos/${newTodo.id}/subtasks`, { title: sub.title })
              )
            );
          }
          await refreshTasks();
        } catch (error) {
          console.error("Error creating task:", error);
        }
      },
      updateTask: async (id: string, data: Partial<Task>) => {
        try {
          const existingTask = tasks.find((t) => t.id === id);
          if (!existingTask) return;

          // 1. If status is updated, we call /complete
          if (data.status !== undefined && data.status !== existingTask.status) {
            const completed = data.status === "done";
            await api.put(`/todos/${id}/complete`, { completed });
          }

          // 2. Update general fields if any of them are provided and differ
          const needsGeneralUpdate =
            data.title !== undefined ||
            data.description !== undefined ||
            data.priority !== undefined ||
            data.dueDate !== undefined;

          if (needsGeneralUpdate) {
            await api.put(`/todos/${id}`, {
              title: data.title !== undefined ? data.title : existingTask.title,
              description: data.description !== undefined ? data.description : existingTask.description,
              due_date: data.dueDate !== undefined
                ? (data.dueDate ? (data.dueDate.includes("T") ? data.dueDate : `${data.dueDate}T00:00:00Z`) : null)
                : (existingTask.dueDate ? `${existingTask.dueDate}T00:00:00Z` : null),
              priority: data.priority !== undefined ? data.priority : existingTask.priority,
              reminder_time: null,
            });
          }

          // 3. Reconcile subtasks if subtasks are passed in update
          if (data.subtasks !== undefined) {
            const existingSubtasks = existingTask.subtasks || [];
            const newSubtasks = data.subtasks;

            const toDelete = existingSubtasks.filter(
              (es) => !newSubtasks.some((ns) => ns.id === es.id)
            );
            const toAdd = newSubtasks.filter(
              (ns) => !existingSubtasks.some((es) => es.id === ns.id)
            );
            const toUpdate = newSubtasks.filter((ns) => {
              const es = existingSubtasks.find((es) => es.id === ns.id);
              return es && (es.done !== ns.done || es.title !== ns.title);
            });

            await Promise.all([
              ...toDelete.map((sub) =>
                api.delete(`/todos/${id}/subtasks/${sub.id}`)
              ),
              ...toAdd.map((sub) =>
                api.post(`/todos/${id}/subtasks`, { title: sub.title })
              ),
              ...toUpdate.map((sub) =>
                api.put(`/todos/${id}/subtasks/${sub.id}`, {
                  title: sub.title,
                  completed: sub.done,
                })
              ),
            ]);
          }

          await refreshTasks();
        } catch (error) {
          console.error("Error updating task:", error);
        }
      },
      deleteTask: async (id: string) => {
        try {
          await api.delete(`/todos/${id}`);
          await refreshTasks();
        } catch (error) {
          console.error("Error deleting task:", error);
        }
      },
      toggleSubtask: async (taskId: string, subtaskId: string) => {
        try {
          const task = tasks.find((t) => t.id === taskId);
          if (!task) return;
          const subtask = task.subtasks.find((s) => s.id === subtaskId);
          if (!subtask) return;

          await api.put(`/todos/${taskId}/subtasks/${subtaskId}`, {
            completed: !subtask.done,
          });

          await refreshTasks();
        } catch (error) {
          console.error("Error toggling subtask:", error);
        }
      },
    }),
    [tasks]
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) {
    throw new Error("useTasks must be used within TasksProvider");
  }
  return context;
}
