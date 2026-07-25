"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, BookOpen, Check, ChevronDown } from "reicon-react";
import { adminApi, type ApiSubject, type ApiSemester, type ApiDepartment, type ApiModule } from "@/lib/api";
import { Dropdown } from "@/components/Dropdown";

const semLabel = (sem: ApiSemester) => `${sem.name}`;

export default function AdminSubjectsPage() {
  const [subjects, setSubjects] = useState<ApiSubject[]>([]);
  const [archivedSubjects, setArchivedSubjects] = useState<ApiSubject[]>([]);
  const [semesters, setSemesters] = useState<ApiSemester[]>([]);
  const [departments, setDepartments] = useState<ApiDepartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleteInput, setDeleteInput] = useState<Record<string, string>>({});
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);

  // Filtering state
  const [filterDept, setFilterDept] = useState("all");
  const [filterSem, setFilterSem] = useState("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingModules, setEditingModules] = useState<ApiModule[]>([]);

  // New subject state
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newSemesterId, setNewSemesterId] = useState("");
  const [newDepartmentId, setNewDepartmentId] = useState("");
  const [savedTick, setSavedTick] = useState(false);

  useEffect(() => {
    Promise.all([
      adminApi.listSubjects(),
      adminApi.listSemesters(),
      adminApi.listDepartments(),
    ]).then(([subjs, sems, depts]) => {
      setSubjects(subjs);
      setSemesters(sems);
      setDepartments(depts);
      if (sems.length > 0) setNewSemesterId(sems[0].id);
      if (depts.length > 0) setNewDepartmentId(depts[0].id);
      setIsLoading(false);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (showArchived && archivedSubjects.length === 0) {
      adminApi
        .listArchivedSubjects()
        .then(setArchivedSubjects)
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : "Unable to load archived subjects"),
        );
    }
  }, [showArchived, archivedSubjects.length]);

  const deptById = useMemo(
    () => new Map(departments.map((d) => [d.id, d])),
    [departments],
  );

  const filtered = useMemo(
    () =>
      subjects.filter(
        (s) =>
          (filterDept === "all" || s.department_id === filterDept) &&
          (filterSem === "all" || s.semester_id === filterSem),
      ),
    [subjects, filterDept, filterSem],
  );

  const groups = useMemo(() => {
    const sortedSems = [...semesters].sort((a, b) => a.number - b.number);
    return sortedSems
      .map((sem) => ({ sem, items: filtered.filter((s) => s.semester_id === sem.id) }))
      .filter((g) => g.items.length > 0);
  }, [filtered, semesters]);

  const clearFilters = () => {
    setFilterDept("all");
    setFilterSem("all");
  };

  const saveTick = () => {
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1800);
  };

  const addSubject = async () => {
    if (!newName.trim() || !newCode.trim() || !newSemesterId || !newDepartmentId) return;
    try {
      const newSubj = await adminApi.createSubject({
        name: newName.trim(),
        code: newCode.trim().toUpperCase(),
        semester_id: newSemesterId,
        department_id: newDepartmentId,
      });
      setSubjects((prev) => [...prev, newSubj]);
      setNewName("");
      setNewCode("");
      setShowNew(false);
      saveTick();
    } catch (err) {
      console.error(err);
      alert("Failed to create subject");
    }
  };

  const removeSubject = async (id: string) => {
    if (!confirm("Are you sure you want to archive this subject?")) return;
    try {
      const target = subjects.find((s) => s.id === id);
      await adminApi.archiveSubject(id);
      setSubjects((prev) => prev.filter(s => s.id !== id));
      if (target) setArchivedSubjects((prev) => [...prev, target]);
      if (editingId === id) setEditingId(null);
    } catch (err) {
      console.error(err);
      alert("Failed to archive subject");
    }
  };

  const unarchiveSubject = async (subject: ApiSubject) => {
    try {
      const updated = await adminApi.unarchiveSubject(subject.id);
      setArchivedSubjects((prev) => prev.filter((s) => s.id !== subject.id));
      setSubjects((prev) => [...prev, updated]);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to unarchive subject");
    }
  };

  const confirmDeleteSubject = (subject: ApiSubject) => {
    setShowDeleteModal(subject.id);
    setDeleteInput((current) => ({ ...current, [subject.id]: "" }));
  };

  const deleteSubject = async (subject: ApiSubject) => {
    const entered = deleteInput[subject.id]?.trim() ?? "";
    if (entered.toUpperCase() !== subject.code) {
      setError("Subject code does not match");
      return;
    }
    try {
      await adminApi.deleteSubject(subject.id, subject.code);
      setArchivedSubjects((prev) => prev.filter((s) => s.id !== subject.id));
      setShowDeleteModal(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete subject");
    }
  };

  const openEditor = async (id: string) => {
    if (editingId === id) {
      setEditingId(null);
      return;
    }
    setEditingId(id);
    try {
      const mods = await adminApi.listModules(id);
      setEditingModules(mods);
    } catch (err) {
      console.error(err);
    }
  };

  const addModule = async (subjectId: string) => {
    const n = editingModules.length + 1;
    try {
      const newMod = await adminApi.createModule({
        name: `Module ${n}`,
        number: n,
        subject_id: subjectId,
      });
      setEditingModules((prev) => [...prev, newMod]);
    } catch (err) {
      console.error(err);
    }
  };

  const updateModule = async (moduleId: string, name: string) => {
    // Optimistic update in UI
    setEditingModules((prev) =>
      prev.map((m) => (m.id === moduleId ? { ...m, name } : m))
    );
  };

  const saveModules = async () => {
    // Send all updates to backend
    try {
      await Promise.all(
        editingModules.map(m => adminApi.updateModule(m.id, { name: m.name }))
      );
      saveTick();
    } catch (err) {
      console.error(err);
      alert("Failed to save modules");
    }
  };

  const removeModule = async (moduleId: string) => {
    if (!confirm("Archive this module?")) return;
    try {
      await adminApi.archiveModule(moduleId);
      setEditingModules((prev) => prev.filter(m => m.id !== moduleId));
    } catch (err) {
      console.error(err);
    }
  };

  if (isLoading) return <div className="p-8">Loading subjects...</div>;

  return (
    <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Manage subjects</h1>
          <p className="text-sm text-muted mt-1">
            Add, edit or remove subjects and their modules.
          </p>
        </div>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="btn-primary inline-flex items-center gap-1.5"
        >
          <Plus size={16} /> New subject
        </button>
      </div>

      {showNew && (
        <div className="panel p-5 mb-6 fade-up">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-4">
            Create new subject
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="field-label">Name</label>
              <input
                className="input"
                placeholder="e.g. Data Structures"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Code</label>
              <input
                className="input"
                placeholder="e.g. CS201"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Department</label>
              <Dropdown
                ariaLabel="Department"
                value={newDepartmentId}
                onChange={setNewDepartmentId}
                placeholder="Select department"
                options={departments.map((department) => ({
                  value: department.id,
                  label: `${department.code} - ${department.name}`,
                }))}
              />
            </div>
            <div>
              <label className="field-label">Semester</label>
              <Dropdown
                ariaLabel="Semester"
                value={newSemesterId}
                onChange={setNewSemesterId}
                placeholder="Select semester"
                options={semesters.map((s) => ({ value: s.id, label: semLabel(s) }))}
              />
            </div>
          </div>
          {departments.length === 0 && (
            <p className="text-err text-xs mb-3">No departments found. Please create one in DB first.</p>
          )}
          <div className="flex gap-2">
            <button onClick={addSubject} className="btn-primary" disabled={!newDepartmentId || !newSemesterId}>
              Create
            </button>
            <button onClick={() => setShowNew(false)} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Branch / semester filter bar */}
      <div className="panel p-4 mb-6 sticky top-4 z-30 bg-panel/90 backdrop-blur">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[230px] flex-1">
            <label className="field-label">Branch</label>
            <Dropdown
              ariaLabel="Filter by branch"
              value={filterDept}
              onChange={setFilterDept}
              options={[
                { value: "all", label: "All branches" },
                ...departments.map((d) => ({ value: d.id, label: `${d.code} — ${d.name}` })),
              ]}
            />
          </div>
          <div className="min-w-[170px]">
            <label className="field-label">Semester</label>
            <Dropdown
              ariaLabel="Filter by semester"
              value={filterSem}
              onChange={(v) => {
                setFilterSem(v);
                if (v !== "all") setExpanded((c) => ({ ...c, [v]: true }));
              }}
              options={[
                { value: "all", label: "All semesters" },
                ...[...semesters]
                  .sort((a, b) => a.number - b.number)
                  .map((s) => ({ value: s.id, label: semLabel(s) })),
              ]}
            />
          </div>
          <div className="flex items-center gap-2 ml-auto pb-0.5">
            <span className="badge badge-red">
              {filtered.length} subject{filtered.length === 1 ? "" : "s"}
            </span>
            {(filterDept !== "all" || filterSem !== "all") && (
              <button onClick={clearFilters} className="btn-ghost text-xs">
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {groups.length === 0 && (
        <div className="panel p-8 text-center text-sm text-muted">
          No subjects match these filters.
        </div>
      )}

      <div className="space-y-8">
        {groups.map(({ sem, items }) => {
          const isExpanded = expanded[sem.id];
          return (
            <section key={sem.id}>
              <button
                type="button"
                onClick={() => setExpanded((c) => ({ ...c, [sem.id]: !c[sem.id] }))}
                className="w-full flex items-center gap-2.5 mb-3 group"
                aria-expanded={isExpanded}
              >
                <ChevronDown
                  size={16}
                  className={`text-brand-accent transition-transform duration-200 ${
                    isExpanded ? "" : "-rotate-90"
                  }`}
                />
                <h2 className="text-[13px] font-bold uppercase tracking-[0.15em]">{sem.name}</h2>
                <span className="badge badge-neutral">{items.length}</span>
                <span className="flex-1 h-px bg-line group-hover:bg-brand/50 transition-colors" />
              </button>

              {isExpanded && (
                <div className="space-y-4">
                  {items.map((s) => {
                    const dept = deptById.get(s.department_id);
                    return (
                      <div key={s.id} className="card card-hover p-5 fade-up">
                        <div className="flex items-start gap-3 mb-4">
                          <div className="w-11 h-11 rounded-xl bg-panel-2 border border-line flex items-center justify-center text-brand-accent">
                            <BookOpen size={20} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h2 className="font-semibold truncate">{s.name}</h2>
                              <span className="badge badge-neutral">{s.code}</span>
                              {dept && <span className="badge badge-red">{dept.code}</span>}
                            </div>
                          </div>
                          <button onClick={() => openEditor(s.id)} className="btn-ghost">
                            {editingId === s.id ? "Close" : "Edit"}
                          </button>
                          <button
                            onClick={() => removeSubject(s.id)}
                            className="btn-ghost text-err hover:bg-err/10"
                          >
                            Archive
                          </button>
                        </div>

                        {editingId === s.id && (
                          <div className="space-y-2 fade-in">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-faint mb-2">
                              Modules
                            </p>
                            {editingModules.length === 0 && (
                              <p className="text-xs text-muted mb-2">No modules yet.</p>
                            )}
                            {editingModules.map((m) => (
                              <div
                                key={m.id}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-panel-2 border border-line-soft"
                              >
                                <input
                                  className="flex-1 bg-transparent text-[13px] text-muted outline-none"
                                  value={m.name}
                                  onChange={(e) => updateModule(m.id, e.target.value)}
                                />
                                <button
                                  onClick={() => removeModule(m.id)}
                                  className="text-[11px] text-faint hover:text-err transition"
                                  title="Remove module"
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => addModule(s.id)}
                                className="btn-ghost inline-flex items-center gap-1.5"
                              >
                                <Plus size={14} /> Add module
                              </button>
                              <button
                                onClick={saveModules}
                                className="btn-primary ml-auto inline-flex items-center gap-1.5"
                              >
                                {savedTick ? (
                                  <>
                                    <Check size={14} /> Saved
                                  </>
                                ) : (
                                  "Save changes"
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-10">
        <button
          className="text-xs text-muted hover:text-brand-accent transition mb-4"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Hide archived subjects" : "Show archived subjects"}
        </button>

        {error && (
          <p className="text-err text-xs mb-3" role="alert">
            {error}
          </p>
        )}

        {showArchived && (
          <div className="space-y-3">
            {archivedSubjects.map((s) => {
              const sem = semesters.find((item) => item.id === s.semester_id);
              return (
                <div key={s.id} className="card p-5 fade-up opacity-80">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-panel-2 border border-line flex items-center justify-center text-faint">
                      <BookOpen size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold truncate line-through decoration-faint">{s.name}</h2>
                        <span className="badge badge-neutral">{s.code}</span>
                        {sem && <span className="badge badge-neutral">{semLabel(sem)}</span>}
                      </div>
                      <p className="text-xs text-faint mt-0.5">Archived</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn-ghost text-brand-accent hover:bg-brand-accent/10"
                        onClick={() => unarchiveSubject(s)}
                      >
                        Unarchive
                      </button>
                      <button
                        className="btn-ghost text-err hover:bg-err/10"
                        onClick={() => confirmDeleteSubject(s)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {showDeleteModal === s.id && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                      <div className="panel p-5 max-w-sm w-full">
                        <p className="text-sm font-semibold mb-2">Permanently delete subject</p>
                        <p className="text-xs text-muted mb-2">
                          This action cannot be undone. To confirm, type the subject code:{" "}
                          <span className="font-mono font-bold">{s.code}</span>
                        </p>
                        <input
                          className="input mb-3"
                          placeholder="Enter subject code"
                          value={deleteInput[s.id] ?? ""}
                          onChange={(e) =>
                            setDeleteInput((current) => ({ ...current, [s.id]: e.target.value }))
                          }
                        />
                        <div className="flex gap-2 justify-end">
                          <button className="btn-secondary" onClick={() => setShowDeleteModal(null)}>
                            Cancel
                          </button>
                          <button
                            className="btn-primary bg-err hover:bg-err/80"
                            disabled={(deleteInput[s.id]?.trim().toUpperCase() ?? "") !== s.code}
                            onClick={() => deleteSubject(s)}
                          >
                            Delete forever
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {archivedSubjects.length === 0 && (
              <p className="text-xs text-muted">No archived subjects.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
