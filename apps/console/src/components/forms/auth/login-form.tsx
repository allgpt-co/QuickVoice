"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import Link from "next/link";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/src/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { EyeIcon, EyeOffIcon, Loader2 } from "lucide-react";
import { authClient } from "@/src/lib/auth-client";
import { loginSchema } from "@/src/models/auth/loginSchema";
import { Checkbox } from "@/src/components/ui/checkbox";
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@/src/components/ui/input-group";
import OAuthButtons from "@/src/components/oauth-buttons";
import { invitationPath } from "@/src/lib/links";

export function LoginForm({ invitationId = "" }: { invitationId?: string } = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });
  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    setError(null);
    setLoading(true);
    try {
      await authClient.signIn.email({
        email: data.email,
        password: data.password,
        rememberMe: data.remember,
        fetchOptions: {
          onSuccess: () => {
            toast.success("Login successful");
            router.push(invitationId ? invitationPath(invitationId) : "/dashboard");
          },
          onError: (ctx) => {
            const msg = ctx.error.message || "Something went wrong";
            toast.error(msg);
            setError(msg);
          },
        },
      });
    } catch {
      const msg = "Unable to reach the server. Please try again.";
      toast.error(msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form {...form}>
      <div className="flex  flex-col items-center gap-2 text-center py-2 ">
        <h1 className="text-2xl font-bold ">Welcome back!</h1>
        <p className="text-muted-foreground text-sm text-balance">
          {invitationId ? "Sign in with the email address that received the invitation." : "Enter your details to login to your account"}
        </p>
      </div>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 ">
        {error && (
          <p className="text-destructive text-lg text-center mt-4 font-semibold">
            {error}
          </p>
        )}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel >Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="name@example.com"
                  type="email"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect="off"
                  disabled={loading}
                  className="h-11"
                />
              </FormControl>

              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="password"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center justify-between">
                <p className="text-muted-foreground">Password</p>{" "}
                <Link
                  href="/forgot-password"
                  className="hover:underline hover:underline-offset-4"
                >
                  Forgot password?
                </Link>
              </FormLabel>
              <InputGroup className="h-11">
                <FormControl>
                  <InputGroupInput
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    className="h-11"
                    {...field}
                  />
                </FormControl>
                  <InputGroupButton
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword(!showPassword)}
                    className="cursor-pointer mr-2"
                  >
                    {showPassword ? (
                      <EyeOffIcon className="size-4" />
                    ) : (
                      <EyeIcon className="size-4" />
                    )}
                  </InputGroupButton>
              </InputGroup>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="remember"
          control={form.control}
          render={({ field}) => (
            <FormItem className="flex items-center gap-2 ml-2 ">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={loading}
                />
              </FormControl>
              <FormLabel>Remember me</FormLabel>
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <span>Login</span>
          )}
        </Button>

        <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-background text-muted-foreground relative z-10 px-2">
            Or
          </span>
        </div>
        <OAuthButtons invitationId={invitationId} />
        <div className="text-center text-sm">
          Don&apos;t have an account?{" "}
          <Link href={invitationPath(invitationId, "/register")} className="underline underline-offset-4">
            Sign up
          </Link>
        </div>
      </form>
    </Form>
  );
}
