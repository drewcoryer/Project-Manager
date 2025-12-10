"use client";

import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import type { AcceptanceCriteria } from "@/data/projects";

interface AcceptanceCriteriaListProps {
  criteria: AcceptanceCriteria[];
}

export function AcceptanceCriteriaList({
  criteria,
}: AcceptanceCriteriaListProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const toggleCriteria = (criteriaId: string) => {
    setCheckedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(criteriaId)) {
        newSet.delete(criteriaId);
      } else {
        newSet.add(criteriaId);
      }
      return newSet;
    });
  };

  const completedCount = checkedItems.size;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-900">Acceptance Criteria</h3>
        <span className="text-sm text-slate-500">
          {completedCount}/{criteria.length} met
        </span>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Per SOW, acceptance requires:
      </p>

      <ul className="space-y-3">
        {criteria.map((item) => {
          const isChecked = checkedItems.has(item.id);
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 cursor-pointer hover:bg-slate-50 rounded-lg p-2 -m-2 transition-colors"
              onClick={() => toggleCriteria(item.id)}
            >
              {isChecked ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-slate-300 mt-0.5 flex-shrink-0" />
              )}
              <p
                className={`text-sm ${
                  isChecked ? "text-slate-500 line-through" : "text-slate-700"
                }`}
              >
                {item.description}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
