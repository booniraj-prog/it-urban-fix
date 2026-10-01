import { useState } from "react";
import { Empty, Field, Modal, MockNote, freshId, useTitle } from "../components/ui";
import { PERMISSIONS, lockedPermissions, permissionLabel } from "../domain/roles";
import { integrationNotes } from "../integrations/mocks";
import { useStore } from "../state/store";
import type { AccessRole } from "../types";

const blank = (): AccessRole => ({
  id: freshId("role"),
  name: "",
  purpose: "",
  status: "active",
  permissions: [],
});

export function RolesPage() {
  useTitle("Roles");
  const { state, saveAccessRole, setAccessRoleStatus, deleteAccessRole } = useStore();
  const [draft, setDraft] = useState<AccessRole | null>(null);
  const [review, setReview] = useState<AccessRole | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AccessRole | null>(null);
  const [pendingStatus, setPendingStatus] = useState<AccessRole | null>(null);
  const roles = state.accessRoles ?? [];

  const save = () => {
    if (!review) return;
    const result = saveAccessRole(review);
    if (result.ok) {
      setReview(null);
      setDraft(null);
    }
  };

  return (
    <div className="page-block">
      <div className="split-head">
        <div>
          <h1>Roles</h1>
          <p>Customer, Technician, and Operations sign people in. Extra roles are directory records only.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => setDraft(blank())}>
          Add role
        </button>
      </div>
      <MockNote>{integrationNotes.auth} Deactivating a sign-in role is blocked so booking, jobs, and operations stay available.</MockNote>
      {roles.length === 0 ? <Empty title="No roles" body="Reset demo data to restore Customer, Technician, and Operations." /> : null}
      <div className="stack">
        {roles.map((role) => {
          const locked = lockedPermissions(role);
          return (
            <article key={role.id} className="role-card">
              <div className="split-head">
                <div>
                  <p className="eyebrow">{role.systemKey ? "Sign-in role" : "Directory role"}</p>
                  <h2>{role.name}</h2>
                </div>
                <span className={`status ${role.status === "active" ? "status-ok" : "status-warn"}`}>
                  {role.status === "active" ? "Active" : "Inactive"}
                </span>
              </div>
              <p>{role.purpose}</p>
              <p className="hint">Permissions: {role.permissions.map(permissionLabel).join(", ") || "None"}.</p>
              {role.systemKey ? <p className="hint">Required permissions stay on: {locked.map(permissionLabel).join(", ")}.</p> : null}
              <div className="row-actions">
                <button className="btn btn-secondary btn-small" type="button" onClick={() => setDraft({ ...role, permissions: [...role.permissions] })}>
                  Edit
                </button>
                {role.status === "active" ? (
                  <button className="btn btn-ghost btn-small" type="button" onClick={() => setPendingStatus(role)} disabled={Boolean(role.systemKey)}>
                    Deactivate
                  </button>
                ) : (
                  <button className="btn btn-secondary btn-small" type="button" onClick={() => setPendingStatus(role)}>
                    Reactivate
                  </button>
                )}
                <button className="btn btn-danger btn-small" type="button" onClick={() => setPendingDelete(role)} disabled={Boolean(role.systemKey)}>
                  Delete
                </button>
              </div>
              {role.systemKey ? <p className="hint">This role cannot be deactivated or deleted. Accounts and workflows still depend on it.</p> : null}
            </article>
          );
        })}
      </div>
      {draft ? (
        <Modal title={roles.some((role) => role.id === draft.id) ? `Edit ${draft.name || "role"}` : "Add a role"} onClose={() => setDraft(null)}>
          <Field id="role-name" label="Name">
            <input id="role-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Field>
          <Field id="role-purpose" label="Purpose" hint="Say what a person with this role is allowed to do.">
            <textarea id="role-purpose" rows={3} value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} />
          </Field>
          <fieldset>
            <legend>Permissions</legend>
            <div className="stack">
              {PERMISSIONS.map((permission) => {
                const locked = lockedPermissions(draft).includes(permission.id);
                const checked = draft.permissions.includes(permission.id);
                return (
                  <label key={permission.id} className="choice">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={(event) => {
                        const permissions = event.target.checked
                          ? [...draft.permissions, permission.id]
                          : draft.permissions.filter((id) => id !== permission.id);
                        setDraft({ ...draft, permissions });
                      }}
                    />
                    <span>
                      <strong>{permission.label}</strong>
                      {locked ? " · required" : ""}
                      <small className="hint"> {permission.detail}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="row-actions">
            <button className="btn btn-ghost" type="button" onClick={() => setDraft(null)}>Cancel</button>
            <button className="btn btn-primary" type="button" onClick={() => setReview(draft)}>Review changes</button>
          </div>
        </Modal>
      ) : null}
      {review ? (
        <Modal title="Save this role?" onClose={() => setReview(null)}>
          <p>
            <strong>{review.name || "Untitled"}</strong> stays {review.status}. Permissions: {review.permissions.map(permissionLabel).join(", ") || "none"}.
          </p>
          {review.systemKey ? <p>Sign-in behavior does not change. Required permissions cannot be removed.</p> : <p>This role will not appear on the sign-in screen.</p>}
          <div className="row-actions">
            <button className="btn btn-ghost" type="button" onClick={() => setReview(null)}>Back</button>
            <button className="btn btn-primary" type="button" onClick={save}>Save role</button>
          </div>
        </Modal>
      ) : null}
      {pendingStatus ? (
        <Modal title={pendingStatus.status === "active" ? `Deactivate ${pendingStatus.name}?` : `Reactivate ${pendingStatus.name}?`} onClose={() => setPendingStatus(null)}>
          <p>
            {pendingStatus.status === "active"
              ? "Inactive roles stay in this list and can be turned back on. They are not deleted."
              : "The role becomes active again. It still does not sign anyone in unless it is Customer, Technician, or Operations."}
          </p>
          <div className="row-actions">
            <button className="btn btn-ghost" type="button" onClick={() => setPendingStatus(null)}>Back</button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                const result = setAccessRoleStatus(pendingStatus.id, pendingStatus.status === "active" ? "inactive" : "active");
                if (result.ok) setPendingStatus(null);
              }}
            >
              {pendingStatus.status === "active" ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        </Modal>
      ) : null}
      {pendingDelete ? (
        <Modal title={`Delete ${pendingDelete.name}?`} onClose={() => setPendingDelete(null)}>
          <p>Deleted roles leave the directory. This cannot be undone from the screen. Sign-in roles are not offered here.</p>
          <div className="row-actions">
            <button className="btn btn-ghost" type="button" onClick={() => setPendingDelete(null)}>Back</button>
            <button
              className="btn btn-danger"
              type="button"
              onClick={() => {
                const result = deleteAccessRole(pendingDelete.id);
                if (result.ok) setPendingDelete(null);
              }}
            >
              Delete role
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
