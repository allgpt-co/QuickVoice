"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Mail, Save, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
 Avatar,
 AvatarFallback,
 AvatarImage,
} from "@/src/components/ui/avatar";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
 Form,
 FormControl,
 FormDescription,
 FormField,
 FormItem,
 FormLabel,
 FormMessage,
} from "@/src/components/ui/form";
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
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/src/components/ui/select";
import { authClient } from "@/src/lib/auth-client";
import { generateSlug } from "@/src/utils/generateSlug";

const orgSchema = z.object({
 name: z.string().min(2),
 slug: z.string().min(2),
});

const inviteSchema = z.object({
 email: z.string().email(),
 role: z.string().min(1, "Role is required"),
});

interface Member {
 id: string;
 role: string;
 user: {
 id: string;
 name: string | null;
 email: string;
 image?: string | null;
 };
}

interface Invitation {
 id: string;
 email: string;
 role: string;
 status: string;
 expiresAt: string | Date;
}

interface Organization {
 id: string;
 name: string;
 slug: string;
 members: Member[];
 invitations?: Invitation[];
}

type OrgRoleApi = {
 inviteMember?: (input: {
 resend?: boolean;
 email: string;
 role: string;
 organizationId: string;
 }) => Promise<{ error?: { message?: string } }>;
 listRoles?: (input: {
 query: { organizationId: string };
 }) => Promise<{ data?: { role: string }[]; error?: { message?: string } }>;
 updateMemberRole?: (input: {
 memberId: string;
 role: string;
 organizationId: string;
 }) => Promise<{ error?: { message?: string } }>;
 cancelInvitation?: (input: {
 invitationId: string;
 }) => Promise<{ error?: { message?: string } }>;
};

export default function OrganizationPage() {
 const { data: session } = authClient.useSession();
 const activeOrgId = session?.session?.activeOrganizationId ?? null;

 const [org, setOrg] = useState<Organization | null>(null);
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 const orgForm = useForm<z.infer<typeof orgSchema>>({
 resolver: zodResolver(orgSchema),
 defaultValues: { name: "", slug: "" },
 });

 async function refresh() {
 if (!activeOrgId) return;
 setLoading(true);
 try {
 const { data, error } = await authClient.organization.getFullOrganization({
 query: { organizationId: activeOrgId },
 });
 if (error) throw new Error(error.message);
 setOrg(data as Organization);
 orgForm.reset({
 name: (data as Organization).name,
 slug: (data as Organization).slug,
 });
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not load organization");
 } finally {
 setLoading(false);
 }
 }

 useEffect(() => {
 refresh();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [activeOrgId]);

 async function onSaveOrg(values: z.infer<typeof orgSchema>) {
 if (!activeOrgId) return;
 setSaving(true);
 try {
 const { error } = await authClient.organization.update({
 organizationId: activeOrgId,
 data: { name: values.name, slug: values.slug },
 });
 if (error) throw new Error(error.message);
 toast.success("Organization updated");
 await refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not update");
 } finally {
 setSaving(false);
 }
 }

 return (
 <div className="space-y-6 pb-24">
 <section className="border bg-card p-6">
 <div className="mb-5 space-y-1">
 <h2 className="text-base font-semibold">Workspace details</h2>
 <p className="text-sm text-muted-foreground">
 The name and slug shown in the org switcher and URLs.
 </p>
 </div>
 {loading ? (
 <div className="space-y-4">
 <Skeleton className="h-10 w-full" />
 <Skeleton className="h-10 w-full" />
 </div>
 ) : (
 <Form {...orgForm}>
 <form
 onSubmit={orgForm.handleSubmit(onSaveOrg)}
 className="space-y-5"
 >
 <FormField
 control={orgForm.control}
 name="name"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Name</FormLabel>
 <FormControl>
 <Input
 {...field}
 onChange={(e) => {
 field.onChange(e);
 if (!orgForm.formState.dirtyFields.slug) {
 orgForm.setValue("slug", generateSlug(e.target.value));
 }
 }}
 />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />
 <FormField
 control={orgForm.control}
 name="slug"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Slug</FormLabel>
 <FormControl>
 <Input {...field} />
 </FormControl>
 <FormDescription>
 Lowercase letters, numbers, and hyphens only.
 </FormDescription>
 <FormMessage />
 </FormItem>
 )}
 />
 <div className="flex justify-end">
 <Button
 type="submit"
 disabled={saving || !orgForm.formState.isDirty}
 >
 {saving ? (
 <>
 <Loader2 className="animate-spin" /> Saving…
 </>
 ) : (
 <>
 <Save /> Save changes
 </>
 )}
 </Button>
 </div>
 </form>
 </Form>
 )}
 </section>

 <MembersSection
 orgId={activeOrgId}
 members={org?.members ?? []}
 invitations={(org?.invitations ?? []).filter((invitation) => invitation.status === "pending" && new Date(invitation.expiresAt).getTime() > Date.now())}
 loading={loading}
 refresh={refresh}
 />
 </div>
 );
}

function MembersSection({
 orgId,
 members,
 invitations,
 loading,
 refresh,
}: {
 orgId: string | null;
 members: Member[];
 invitations: Invitation[];
 loading: boolean;
 refresh: () => Promise<void>;
}) {
 const [inviteOpen, setInviteOpen] = useState(false);
 const [inviting, setInviting] = useState(false);
 const [resendingId, setResendingId] = useState<string | null>(null);
 const [roles, setRoles] = useState(["member", "admin", "owner"]);
 const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
 const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
 const [cancelTarget, setCancelTarget] = useState<Invitation | null>(null);

 const inviteForm = useForm<z.infer<typeof inviteSchema>>({
 resolver: zodResolver(inviteSchema),
 defaultValues: { email: "", role: "member" },
 });

 useEffect(() => {
 async function loadRoles() {
 if (!orgId) return;
 const builtIn = ["member", "admin", "owner"];
 try {
 const orgApi = authClient.organization as unknown as OrgRoleApi;
 if (!orgApi.listRoles) {
 setRoles(builtIn);
 return;
 }
 const { data } = await orgApi.listRoles({
 query: { organizationId: orgId },
 });
 setRoles([...new Set([...builtIn, ...(data ?? []).map((role) => role.role)])]);
 } catch {
 setRoles(builtIn);
 }
 }
 loadRoles();
 }, [orgId]);

 async function onInvite(values: z.infer<typeof inviteSchema>, invitationId?: string) {
 if (!orgId) return;
 setInviting(true);
 setResendingId(invitationId ?? null);
 try {
 const orgApi = authClient.organization as unknown as OrgRoleApi;
 if (!orgApi.inviteMember) throw new Error("Invites are not available");
 const { error } = await orgApi.inviteMember({
 email: values.email,
 role: values.role,
 organizationId: orgId,
 resend: !!invitationId,
 });
 if (error) throw new Error(error.message);
 toast.success(`Invitation email sent to ${values.email}`);
 setInviteOpen(false);
 inviteForm.reset();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not send invite");
 } finally {
 await refresh();
 setInviting(false);
 setResendingId(null);
 }
 }

 async function onRoleChange(memberId: string, role: string) {
 if (!orgId) return;
 setUpdatingMemberId(memberId);
 try {
 const orgApi = authClient.organization as unknown as OrgRoleApi;
 if (!orgApi.updateMemberRole) {
 throw new Error("Member role updates are not available");
 }
 const { error } = await orgApi.updateMemberRole({
 memberId,
 role,
 organizationId: orgId,
 });
 if (error) throw new Error(error.message);
 toast.success("Member role updated");
 await refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not update role");
 } finally {
 setUpdatingMemberId(null);
 }
 }

 async function onRemove(memberId: string) {
 if (!orgId) return;
 try {
 const { error } = await authClient.organization.removeMember({
 memberIdOrEmail: memberId,
 organizationId: orgId,
 });
 if (error) throw new Error(error.message);
 toast.success("Member removed");
 setRemoveTarget(null);
 await refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not remove member");
 }
 }

 async function onCancelInvitation(invitationId: string) {
 try {
 const orgApi = authClient.organization as unknown as OrgRoleApi;
 if (!orgApi.cancelInvitation) {
 throw new Error("Invite cancellation is not available");
 }
 const { error } = await orgApi.cancelInvitation({ invitationId });
 if (error) throw new Error(error.message);
 toast.success("Invitation canceled");
 setCancelTarget(null);
 await refresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : "Could not cancel invite");
 }
 }

 return (
 <section className="border bg-card p-6">
 <div className="mb-5 flex items-start justify-between gap-3">
 <div className="space-y-1">
 <h2 className="text-base font-semibold">Team members</h2>
 <p className="text-sm text-muted-foreground">
 Invite teammates and manage their roles.
 </p>
 </div>
 <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
 <DialogTrigger asChild>
 <Button>
 <UserPlus /> Invite member
 </Button>
 </DialogTrigger>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>Invite a member</DialogTitle>
 <DialogDescription>
 They&apos;ll receive an email to join this organization.
 </DialogDescription>
 </DialogHeader>
 <Form {...inviteForm}>
 <form
 onSubmit={inviteForm.handleSubmit((values) => onInvite(values))}
 className="space-y-5"
 >
 <FormField
 control={inviteForm.control}
 name="email"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Email</FormLabel>
 <FormControl>
 <Input type="email" placeholder="teammate@company.com" {...field} />
 </FormControl>
 <FormMessage />
 </FormItem>
 )}
 />
 <FormField
 control={inviteForm.control}
 name="role"
 render={({ field }) => (
 <FormItem>
 <FormLabel>Role</FormLabel>
 <Select
 value={field.value}
 onValueChange={field.onChange}
 >
 <FormControl>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 </FormControl>
 <SelectContent>
 {roles.map((role) => (
 <SelectItem key={role} value={role}>
 {role}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 </FormItem>
 )}
 />
 <DialogFooter>
 <Button
 type="button"
 variant="outline"
 onClick={() => setInviteOpen(false)}
 disabled={inviting}
 >
 Cancel
 </Button>
 <Button type="submit" disabled={inviting}>
 {inviting ? (
 <>
 <Loader2 className="animate-spin" /> Sending…
 </>
 ) : (
 <>
 <Mail /> Send invite
 </>
 )}
 </Button>
 </DialogFooter>
 </form>
 </Form>
 </DialogContent>
 </Dialog>
 </div>

 {loading ? (
 <div className="space-y-2">
 {[...Array(3)].map((_, i) => (
 <Skeleton key={i} className="h-14 w-full" />
 ))}
 </div>
 ) : !members.length ? (
 <p className="py-6 text-center text-sm text-muted-foreground">
 No members yet.
 </p>
 ) : (
 <div className="divide-y">
 {members.map((m) => (
 <div
 key={m.id}
 className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
 >
 <Avatar className="size-9">
 {m.user.image ? (
 <AvatarImage src={m.user.image} alt={m.user.name ?? m.user.email} />
 ) : null}
 <AvatarFallback>
 {(m.user.name ?? m.user.email).charAt(0).toUpperCase()}
 </AvatarFallback>
 </Avatar>
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-medium">
 {m.user.name || m.user.email}
 </p>
 <p className="truncate text-xs text-muted-foreground">
 {m.user.email}
 </p>
 </div>
 <Select
 value={m.role}
 onValueChange={(role) => onRoleChange(m.id, role)}
 disabled={updatingMemberId === m.id}
 >
 <SelectTrigger className="h-8 w-32">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {roles.map((role) => (
 <SelectItem key={role} value={role}>
 {role}
 </SelectItem>
 ))}
 </SelectContent>
 </Select>
 <Button
 variant="ghost"
 size="icon-sm"
 onClick={() => setRemoveTarget(m)}
 aria-label={`Remove ${m.user.name || m.user.email}`}
 >
 <Trash2 />
 </Button>
 </div>
 ))}
 </div>
 )}
 {invitations.length ? (
 <div className="mt-6 border-t pt-5">
 <div className="mb-3">
 <h3 className="text-sm font-semibold">Pending invites</h3>
 <p className="text-xs text-muted-foreground">
 Resend an invitation email or cancel access before it is accepted.
 </p>
 </div>
 <div className="divide-y">
 {invitations.map((invitation) => (
 <div
 key={invitation.id}
 className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
 >
 <div className="min-w-0 flex-1">
 <p className="truncate text-sm font-medium">{invitation.email}</p>
 <p className="truncate text-xs text-muted-foreground">
 {invitation.role} · {invitation.status}
 </p>
 </div>
 <Button
 variant="outline"
 size="sm"
 className="min-h-11 scroll-mb-24"
 disabled={inviting}
 aria-label={`Resend invitation to ${invitation.email}`}
 onClick={() => onInvite({ email: invitation.email, role: invitation.role }, invitation.id)}
 >
 {resendingId === invitation.id ? <Loader2 className="motion-safe:animate-spin" /> : <Mail />}
 Resend
 </Button>
 <Button
 variant="ghost"
 size="sm"
 disabled={inviting}
 className="min-h-11 scroll-mb-24"
 onClick={() => setCancelTarget(invitation)}
 >
 Cancel
 </Button>
 </div>
 ))}
 </div>
 </div>
 ) : null}
 <AlertDialog
 open={!!removeTarget}
 onOpenChange={(open) => {
 if (!open) setRemoveTarget(null);
 }}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Remove member?</AlertDialogTitle>
 <AlertDialogDescription>
 This removes {removeTarget?.user.name || removeTarget?.user.email} from the
 organization and revokes their access.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancel</AlertDialogCancel>
 <AlertDialogAction
 onClick={() => removeTarget && onRemove(removeTarget.id)}
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 Remove
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 <AlertDialog
 open={!!cancelTarget}
 onOpenChange={(open) => {
 if (!open) setCancelTarget(null);
 }}
 >
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Cancel invite?</AlertDialogTitle>
 <AlertDialogDescription>
 This cancels the invitation for {cancelTarget?.email}.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Keep invite</AlertDialogCancel>
 <AlertDialogAction
 onClick={() => cancelTarget && onCancelInvitation(cancelTarget.id)}
 className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
 >
 Cancel invite
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 </section>
 );
}
