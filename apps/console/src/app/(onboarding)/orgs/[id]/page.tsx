"use client";

import { useParams, useSearchParams } from "next/navigation";
import { authClient } from "@/src/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/src/lib/query-keys";
import Link from "next/link";
import { Building2, Users, ArrowLeft, Mail, Settings, Calendar, Shield } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";


export default function OrgId() {
 const params = useParams();
 const searchParams = useSearchParams();

 const orgId = params.id as string;
 const orgSlug = searchParams.get("orgSlug");

 const { data, error: loadError, isPending: loading } = useQuery({
 queryKey: [...queryKeys.org.detail(orgId), orgSlug],
 enabled: !!orgId,
 queryFn: async () => {
 const { data, error } = await authClient.organization.getFullOrganization({
 query: { organizationId: orgId, organizationSlug: orgSlug || undefined, membersLimit: 10 },
 });
 if (error) throw new Error(error.message || "Failed to load organization");
 return data as Organization | null;
 },
 });
 const error = loadError?.message;

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-screen">
 <div className="animate-spin h-8 w-8 border-b-2 border-primary"></div>
 </div>
 );
 }

 if (error) {
 return (
 <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10 max-w-6xl mx-auto">
 <div className="text-center py-12">
 <div className="flex h-16 w-16 items-center justify-center bg-destructive/10 mx-auto mb-4">
 <Shield className="h-8 w-8 text-destructive" />
 </div>
 <h3 className="text-lg font-semibold text-foreground mb-2">Error loading organization</h3>
 <p className="text-sm text-muted-foreground mb-6">{error}</p>
 <Link href="/orgs">
 <Button>Back to organizations</Button>
 </Link>
 </div>
 </div>
 );
 }

 if (!data) {
 return (
 <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10 max-w-6xl mx-auto">
 <div className="text-center py-12">
 <h3 className="text-lg font-semibold text-foreground mb-2">Organization not found</h3>
 <Link href="/orgs">
 <Button>Back to organizations</Button>
 </Link>
 </div>
 </div>
 );
 }

 return (
 <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10 max-w-6xl mx-auto">
 {/* Header */}
 <div className="flex items-center justify-between mb-8">
 <div className="flex items-center gap-4">
 <Link href="/orgs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
 <ArrowLeft className="h-4 w-4" />
 Back to organizations
 </Link>
 </div>
 <div className="flex items-center gap-2">
 <Button variant="outline" size="sm">
 <Settings className="h-4 w-4 mr-2" />
 Settings
 </Button>
 </div>
 </div>

 {/* Organization Info */}
 <div className="border border-border bg-card p-6 sm:p-8 mb-8">
 <div className="flex items-start gap-6">
 <div className="flex h-16 w-16 items-center justify-center bg-primary/10 text-primary">
 <Building2 className="h-8 w-8" />
 </div>
 <div className="flex-1">
 <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2">
 {data.name}
 </h1>
 <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
 <span>@{data.slug}</span>
 <span>•</span>
 <span>ID: {data.id}</span>
 </div>
 <div className="flex items-center gap-6">
 <div className="flex items-center gap-2 text-sm">
 <Users className="h-4 w-4 text-muted-foreground" />
 <span className="text-foreground font-medium">{data.members.length} members</span>
 </div>
 <div className="flex items-center gap-2 text-sm">
 <Calendar className="h-4 w-4 text-muted-foreground" />
 <span className="text-muted-foreground">
 Created {new Date(data.createdAt).toLocaleDateString()}
 </span>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Members Section */}
 <div className="border border-border bg-card p-6 sm:p-8">
 <div className="flex items-center justify-between mb-6">
 <h2 className="text-xl font-semibold text-foreground">Team Members</h2>
 <Button size="sm">
 <Users className="h-4 w-4 mr-2" />
 Invite Member
 </Button>
 </div>

 {data.members.length === 0 ? (
 <div className="text-center py-8">
 <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
 <p className="text-sm text-muted-foreground">No members found</p>
 </div>
 ) : (
 <div className="space-y-4">
 {data.members.map((member: Member) => (
 <div key={member.id} className="flex items-center justify-between p-4 border border-border bg-muted/30">
 <div className="flex items-center gap-4">
 <div className="flex h-10 w-10 items-center justify-center bg-primary/10 text-primary">
 {member.user.name ? member.user.name.charAt(0).toUpperCase() : member.user.email.charAt(0).toUpperCase()}
 </div>
 <div>
 <p className="font-medium text-foreground">
 {member.user.name || "Unknown User"}
 </p>
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Mail className="h-3 w-3" />
 {member.user.email}
 </div>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Badge variant={member.role === "admin" ? "default" : "secondary"}>
 {member.role}
 </Badge>
 <span className="text-xs text-muted-foreground">
 Joined {new Date(member.createdAt).toLocaleDateString()}
 </span>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 );
}
