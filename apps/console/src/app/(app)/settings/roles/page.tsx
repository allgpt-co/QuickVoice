"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Pencil, Plus, RefreshCw, Save, Shield, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Badge } from "@/src/components/ui/badge";
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
 DialogTrigger,
} from "@/src/components/ui/dialog";
import {
 Form,
 FormControl,
 FormField,
 FormItem,
 FormLabel,
 FormMessage,
} from "@/src/components/ui/form";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EmptyState } from "@/src/components/common/EmptyState";
import { PermissionMatrix } from "@/src/components/settings/PermissionMatrix";
import { authClient } from "@/src/lib/auth-client";
import { queryKeys } from "@/src/lib/query-keys";
import { BUILTIN_ROLES, type Permissions, type ResourceId } from "@/src/lib/permissions";

const schema = z.object({
 role: z
 .string()
 .min(2)
 .regex(/^[a-z][a-z0-9_-]*$/, "Lowercase letters, digits, dashes"),
});

interface Role {
 id: string;
 role: string;
 permission: Permissions;
}

type RoleApiResult<T> = Promise<{ data?: T; error?: { message?: string } }>;

type RoleApi = {
 listRoles?: (input: { query: { organizationId: string } }) => RoleApiResult<Role[]>;
 createRole?: (input: {
 organizationId: string;
 role: string;
 permission: Record<string, string[]>;
 }) => RoleApiResult<{ success: boolean; roleData: Role }>;
 updateRole?: (input: {
 organizationId: string;
 roleId: string;
 data: { roleName: string; permission: Record<string, string[]> };
 }) => RoleApiResult<{ success: boolean; roleData: Role }>;
 deleteRole?: (input: {
 organizationId: string;
 roleId: string;
 }) => RoleApiResult<{ success: boolean }>;
};

const builtInRoleSet = new Set<string>(BUILTIN_ROLES);

function roleApi() {
 return authClient.organization as unknown as RoleApi;
}

function toRoleList(data: unknown): Role[] {
 return Array.isArray(data) ? (data as Role[]) : [];
}

export default function RolesPage() {
 const { data: session } = authClient.useSession();
 const orgId = session?.session?.activeOrganizationId ?? null;

 const [createOpen, setCreateOpen] = useState(false);
 const [permissions, setPermissions] = useState<Permissions>({});
 const [saving, setSaving] = useState(false);
 const [editRole, setEditRole] = useState<Role | null>(null);
 const [editPermissions, setEditPermissions] = useState<Permissions>({});
 const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

 const form = useForm<z.infer<typeof schema>>({
 resolver: zodResolver(schema),
 defaultValues: { role: "" },
 });
 const editForm = useForm<z.infer<typeof schema>>({
 resolver: zodResolver(schema),
 defaultValues: { role: "" },
 });

 const { data: roles, isFetching: loading, error: loadError, refetch } = useQuery({
 queryKey: queryKeys.org.roles(orgId),
 enabled: !!orgId,
 queryFn: async () => {
 if (!orgId) return [];
 const api = roleApi();
 if (!api.listRoles) throw new Error("Custom role listing is not available");
 const { data, error } = await api.listRoles({
 query: { organizationId: orgId },
 });
 if (error) throw new Error(error.message || "Could not load roles");
 return toRoleList(data);
 },
 });
 const customRoles = useMemo(
 () => (roles ?? []).filter((role) => !builtInRoleSet.has(role.role)),
 [roles]
 );

 async function refreshRoles() {
 await refetch();
 }

 function openEdit(role: Role) {
 setEditRole(role);
 setEditPermissions(role.permission ?? {});
 editForm.reset({ role: role.role });
 }

 async function onCreate(values: z.infer<typeof schema>) {
 if (!orgId) return;
 setSaving(true);
 try {
 const api = roleApi();
 if (!api.createRole) throw new Error("Custom role creation is not available");
 const { error } = await api.createRole({
 organizationId: orgId,
 role: values.role,
 permission: permissions as Record<ResourceId, string[]>,
 });
 if (error) throw new Error(error.message);
 toast.success(`Role "${values.role}" created`);
 setCreateOpen(false);
 form.reset();
 setPermissions({});
 await refreshRoles();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not create role");
 } finally {
 setSaving(false);
 }
 }

 async function onUpdate(values: z.infer<typeof schema>) {
 if (!orgId || !editRole) return;
 setSaving(true);
 try {
 const api = roleApi();
 if (!api.updateRole) throw new Error("Custom role updates are not available");
 const { error } = await api.updateRole({
 organizationId: orgId,
 roleId: editRole.id,
 data: {
 roleName: values.role,
 permission: editPermissions as Record<ResourceId, string[]>,
 },
 });
 if (error) throw new Error(error.message);
 toast.success(`Role "${values.role}" saved`);
 setEditRole(null);
 setEditPermissions({});
 await refreshRoles();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not update role");
 } finally {
 setSaving(false);
 }
 }

 async function onDelete() {
 if (!orgId || !deleteTarget) return;
 setSaving(true);
 try {
 const api = roleApi();
 if (!api.deleteRole) throw new Error("Custom role deletion is not available");
 const { error } = await api.deleteRole({
 organizationId: orgId,
 roleId: deleteTarget.id,
 });
 if (error) throw new Error(error.message);
 toast.success(`Role "${deleteTarget.role}" deleted`);
 setDeleteTarget(null);
 await refreshRoles();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not delete role");
 } finally {
 setSaving(false);
 }
 }

 return (
 <div className="space-y-6">
 <section className="border bg-card p-6">
 <div className="mb-5 flex items-start justify-between gap-3">
 <div className="space-y-1">
 <h2 className="text-base font-semibold">Custom roles</h2>
 <p className="text-sm text-muted-foreground">
 Built-in roles (owner, admin, member) always exist. Add custom
 roles for fine-grained access.
 </p>
 </div>
 <Dialog open={createOpen} onOpenChange={setCreateOpen}>
 <DialogTrigger asChild>
 <Button>
 <Plus /> New role
 </Button>
 </DialogTrigger>
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>Create custom role</DialogTitle>
 <DialogDescription>
 Pick the permissions this role should have. Role names are
 lowercase and can include dashes.
 </DialogDescription>
 </DialogHeader>
 <Form {...form}>
 <form
 onSubmit={form.handleSubmit(onCreate)}
 className="space-y-5"
 >
 <FormField
 control={form.control}
 name="role"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Role name</FormLabel>
 <FormControl>
 <Input placeholder="e.g. auditor" {...field} />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />
 <div>
 <FormLabel>Permissions</FormLabel>
 <div className="mt-2">
 <PermissionMatrix value={permissions} onChange={setPermissions} />
 </div>
 </div>
 <DialogFooter>
 <Button
 type="button"
 variant="outline"
 onClick={() => setCreateOpen(false)}
 disabled={saving}
 >
 Cancel
 </Button>
 <Button type="submit" disabled={saving}>
 {saving ? (
 <>
 <Loader2 className="animate-spin" /> Creating...
 </>
 ) : (
 <>
 <Save /> Create role
 </>
 )}
 </Button>
 </DialogFooter>
 </form>
 </Form>
 </DialogContent>
 </Dialog>
 </div>

 <div className="mb-6 space-y-3">
 {BUILTIN_ROLES.map((role) => (
 <div
 key={role}
 className="flex items-center justify-between border bg-muted/20 p-3"
 >
 <div className="flex items-center gap-3">
 <div className="flex size-8 items-center justify-center border bg-background">
 <Shield className="size-4 text-primary" />
 </div>
 <div>
 <p className="text-sm font-medium capitalize">{role}</p>
 <p className="text-xs text-muted-foreground">Built-in</p>
 </div>
 </div>
 <Badge variant="secondary">System</Badge>
 </div>
 ))}
 </div>

 {loading ? (
 <div className="space-y-2">
 {[...Array(3)].map((_, index) => (
 <Skeleton key={index} className="h-14 w-full" />
 ))}
 </div>
 ) : loadError ? (
 <EmptyState
 icon={Shield}
 title="Could not load custom roles"
 description={loadError.message}
 action={
 <Button variant="outline" onClick={refreshRoles}>
 <RefreshCw /> Retry
 </Button>
 }
 className="border-0"
 />
 ) : !customRoles.length ? (
 <EmptyState
 icon={Shield}
 title="No custom roles yet"
 description="Built-in roles (owner, admin, member) are always available. Create a custom role for finer-grained access."
 className="border-0"
 />
 ) : (
 <div className="divide-y">
 {customRoles.map((role) => (
 <div key={role.id} className="flex items-center justify-between gap-3 py-3">
 <div>
 <p className="text-sm font-medium">{role.role}</p>
 <p className="text-xs text-muted-foreground">
 {Object.keys(role.permission ?? {}).length} resources
 </p>
 </div>
 <div className="flex items-center gap-1">
 <Button
 variant="ghost"
 size="icon-sm"
 aria-label={`Edit role ${role.role}`}
 onClick={() => openEdit(role)}
 >
 <Pencil />
 </Button>
 <Button
 variant="ghost"
 size="icon-sm"
 aria-label={`Delete role ${role.role}`}
 onClick={() => setDeleteTarget(role)}
 >
 <Trash2 />
 </Button>
 </div>
 </div>
 ))}
 </div>
 )}
 </section>

 <Dialog
 open={!!editRole}
 onOpenChange={(open) => {
 if (!open) setEditRole(null);
 }}
 >
 <DialogContent className="max-w-2xl">
 <DialogHeader>
 <DialogTitle>Edit custom role</DialogTitle>
 <DialogDescription>
 Update the role name or permission matrix for this organization.
 </DialogDescription>
 </DialogHeader>
 <Form {...editForm}>
 <form onSubmit={editForm.handleSubmit(onUpdate)} className="space-y-5">
 <FormField
 control={editForm.control}
 name="role"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Role name</FormLabel>
 <FormControl>
 <Input {...field} />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />
 <div>
 <FormLabel>Permissions</FormLabel>
 <div className="mt-2">
 <PermissionMatrix value={editPermissions} onChange={setEditPermissions} />
 </div>
 </div>
 <DialogFooter>
 <Button
 type="button"
 variant="outline"
 onClick={() => setEditRole(null)}
 disabled={saving}
 >
 Cancel
 </Button>
 <Button type="submit" disabled={saving}>
 {saving ? (
 <>
 <Loader2 className="animate-spin" /> Saving...
 </>
 ) : (
 <>
 <Save /> Save role
 </>
 )}
 </Button>
 </DialogFooter>
 </form>
 </Form>
 </DialogContent>
 </Dialog>

 <AlertDialog
 open={!!deleteTarget}
 onOpenChange={(open) => {
 if (!open) setDeleteTarget(null);
 }}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Delete custom role?</AlertDialogTitle>
 <AlertDialogDescription>
 This removes {deleteTarget?.role ?? "this role"} from the organization.
 Members using it should be reassigned before deletion.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancel</AlertDialogCancel>
 <AlertDialogAction
 onClick={onDelete}
 disabled={saving}
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 {saving ? (
 <>
 <Loader2 className="animate-spin" /> Deleting...
 </>
 ) : (
 "Delete"
 )}
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </div>
 );
}
