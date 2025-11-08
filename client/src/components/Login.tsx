import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { authApi } from '../lib/api';
import { toast } from 'sonner';

interface LoginProps {
  onLogin: (user: any) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [registering, setRegistering] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.login(email, password);
      // Store token in localStorage
      localStorage.setItem('authToken', response.token);
      onLogin(response.user);
      toast.success('Login successful!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const demoUsers = [
    { email: 'alice@example.com', name: 'Alice Johnson' },
    { email: 'bob@example.com', name: 'Bob Smith' },
    { email: 'charlie@example.com', name: 'Charlie Brown' },
    { email: 'diana@example.com', name: 'Diana Prince' },
  ];

  const loginAsDemo = async (demoEmail: string) => {
    setLoading(true);
    try {
      const response = await authApi.login(demoEmail, 'SecurePass123!');
      // Store token in localStorage
      localStorage.setItem('authToken', response.token);
      onLogin(response.user);
      toast.success(`Logged in as ${response.user.name}!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!regName || !regEmail || !regPassword || !regConfirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (regPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    // Basic password strength check
    const hasLowercase = /[a-z]/.test(regPassword);
    const hasUppercase = /[A-Z]/.test(regPassword);
    const hasNumber = /\d/.test(regPassword);

    if (!hasLowercase || !hasUppercase || !hasNumber) {
      toast.error('Password must contain at least one lowercase letter, one uppercase letter, and one number');
      return;
    }

    setRegistering(true);
    try {
      const response = await authApi.register(regName, regEmail, regPassword);
      // Store token in localStorage
      localStorage.setItem('authToken', response.token);
      onLogin(response.user);
      toast.success('Registration successful! Welcome to Colabora!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Collaborative Drafting</CardTitle>
          <CardDescription>
            Sign in or create an account to access collaborative document editing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter any password"
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="space-y-4">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="regName">Full Name</Label>
                  <Input
                    id="regName"
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Enter your full name"
                    disabled={registering}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regEmail">Email</Label>
                  <Input
                    id="regEmail"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="Enter your email"
                    disabled={registering}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regPassword">Password</Label>
                  <Input
                    id="regPassword"
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Create a strong password"
                    disabled={registering}
                  />
                  <p className="text-xs text-gray-600">
                    Must contain at least 8 characters with uppercase, lowercase, and number
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="regConfirmPassword">Confirm Password</Label>
                  <Input
                    id="regConfirmPassword"
                    type="password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    disabled={registering}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={registering}>
                  {registering ? 'Creating Account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Demo Accounts</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {demoUsers.map((user) => (
              <Button
                key={user.email}
                variant="outline"
                size="sm"
                onClick={() => loginAsDemo(user.email)}
                disabled={loading}
                className="text-xs"
              >
                {user.name}
              </Button>
            ))}
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Use any password with the demo accounts above
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
