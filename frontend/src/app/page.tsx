"use client";

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { ArrowRight, MessageCircle, MapPin, LogOut, User, X, Plus, Check } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

// ─── Domain Config ───────────────────────────────────────────────
const HOSTELS = [
  { name: 'Kailash (MT3)', wings: ['A', 'B', 'C', 'D'] },
  { name: 'Everest (MT1)', wings: ['A', 'B'] },
  { name: 'Nilgiri (Block 5)', wings: [] }
];

// ─── Toast Component ─────────────────────────────────────────────
function Toast({ message, type = 'success', onClose }: { message: string; type?: 'success' | 'error' | 'warning'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: 'bg-[#25D366]/90 text-white',
    error: 'bg-red-500/90 text-white',
    warning: 'bg-accent/90 text-bg-base',
  };

  return (
    <div className={`toast-enter fixed top-4 right-4 z-[200] px-5 py-3 rounded-xl ${colors[type]} font-medium text-sm backdrop-blur-md shadow-2xl max-w-sm`}>
      {message}
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────
function SwapBoardContent() {
  const [towerFilter, setTowerFilter] = useState('All');
  const [wingFilter, setWingFilter] = useState('All');
  const [user, setUser] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    tower: 'Kailash (MT3)', floor: '1', wing: 'A', room: '', want: '', whatsapp: ''
  });

  const searchParams = useSearchParams();
  const supabase = createClient();

  const fetchListings = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("http://127.0.0.1:8000/api/listings");
      const json = await res.json();
      if (json.status === "success") setListings(json.data);
    } catch (err) {
      console.error("Failed to fetch listings", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListings();

    const error = searchParams.get('error');
    if (error === 'UnauthorizedDomain') {
      setToast({ message: "Access denied. Use your @nitk.edu.in email.", type: 'error' });
      window.history.replaceState(null, '', '/');
    }

    supabase.auth.getSession().then(({ data: { session } }) => setUser(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, [searchParams, supabase, fetchListings]);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const handleResolve = async (listingId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/listings/${listingId}/resolve`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${session.access_token}` }
      });
      const result = await res.json();
      if (res.ok) {
        setToast({ message: "Marked as swapped! 🎉", type: 'success' });
        fetchListings();
      } else {
        setToast({ message: result.detail || "Failed to resolve.", type: 'error' });
      }
    } catch {
      setToast({ message: "Can't reach server.", type: 'error' });
    }
  };

  const handleConnect = (whatsapp: string, have: any) => {
    const roomStr = have.wing ? `${have.wing}-${have.room}` : `Room ${have.room}`;
    const msg = encodeURIComponent(`Hey! Saw your listing on Hxchange. Interested in swapping for your ${roomStr} in ${have.tower}. Let's discuss?`);
    window.open(`https://wa.me/${whatsapp}?text=${msg}`, '_blank');
  };

  const handleTowerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTower = e.target.value;
    const hostel = HOSTELS.find(h => h.name === newTower);
    setFormData({ ...formData, tower: newTower, wing: hostel?.wings.length ? hostel.wings[0] : '' });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return setToast({ message: "You must be logged in!", type: 'error' });

    const hostel = HOSTELS.find(h => h.name === formData.tower);
    const hasWings = hostel && hostel.wings.length > 0;
    setIsSubmitting(true);

    try {
      const response = await fetch("http://127.0.0.1:8000/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({
          have_tower: formData.tower, have_floor: parseInt(formData.floor),
          have_wing: hasWings ? formData.wing : null, have_room: formData.room,
          want_description: formData.want, whatsapp_number: formData.whatsapp
        })
      });
      const result = await response.json();
      if (response.ok) {
        setToast({ message: "Room listed! You're live on the board.", type: 'success' });
        setIsModalOpen(false);
        fetchListings();
        setFormData({ tower: 'Kailash (MT3)', floor: '1', wing: 'A', room: '', want: '', whatsapp: '' });
      } else {
        setToast({ message: result.detail || "Something went wrong.", type: 'error' });
      }
    } catch {
      setToast({ message: "Can't reach server. Is FastAPI running?", type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasActiveListing = user && listings.some(l => l.user_id === user.id && (l.status === 'active' || !l.status));

  // Build filter chips
  type Chip = { label: string; tower: string; wing: string };
  const chips: Chip[] = [{ label: 'All', tower: 'All', wing: 'All' }];
  HOSTELS.forEach(h => {
    if (h.wings.length === 0) {
      chips.push({ label: h.name.split(' ')[0], tower: h.name, wing: 'All' });
    } else {
      h.wings.forEach(w => {
        const short = h.name.split(' ')[0];
        chips.push({ label: `${short} · ${w}`, tower: h.name, wing: w });
      });
    }
  });

  const activeChipLabel = (() => {
    if (towerFilter === 'All') return 'All';
    const short = towerFilter.split(' ')[0];
    if (wingFilter === 'All') return short;
    return `${short} · ${wingFilter}`;
  })();

  const filteredListings = listings.filter(l => {
    const mt = towerFilter === 'All' || l.have_tower === towerFilter;
    const mw = wingFilter === 'All' || l.have_wing === wingFilter;
    return mt && mw;
  });

  const selectedFormHostel = HOSTELS.find(h => h.name === formData.tower);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary font-sans selection:bg-accent/20">

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ─── Floating Navbar ─── */}
      <nav className="sticky top-0 z-50 px-3 pt-3">
        <div className="max-w-3xl mx-auto bg-bg-raised/80 backdrop-blur-2xl border border-border-subtle rounded-2xl px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-accent text-base tracking-tight">Hx</span>
            <span className="text-sm font-semibold text-text-primary tracking-tight">change</span>
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <img
                  src={user.user_metadata?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=fallback"}
                  alt="" className="w-6 h-6 rounded-full border border-border-subtle object-cover"
                />
                {hasActiveListing ? (
                  <span className="text-xs font-medium text-text-secondary px-2.5 py-1 rounded-full border border-border-subtle">
                    Listed ✓
                  </span>
                ) : (
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-1 text-xs font-semibold bg-accent text-bg-base px-3 py-1.5 rounded-full hover:brightness-110 active:scale-95 transition-all"
                  >
                    <Plus size={13} strokeWidth={2.5} /> List
                  </button>
                )}
                <button onClick={handleLogout} className="p-1.5 text-text-tertiary hover:text-danger transition-colors rounded-full" title="Sign Out">
                  <LogOut size={14} />
                </button>
              </>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-1.5 text-xs font-semibold bg-accent text-bg-base px-3 py-1.5 rounded-full hover:brightness-110 active:scale-95 transition-all"
              >
                <User size={13} /> Login
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <main className="max-w-3xl mx-auto px-4 pt-10 pb-16">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.03em] leading-tight mb-2">
            Find your perfect<br />
            <span className="text-accent">room match.</span>
          </h1>
          <p className="text-text-secondary text-sm leading-relaxed max-w-md">
            Stop spamming WhatsApp groups. Browse, filter, and connect with swap partners instantly.
          </p>
        </div>

        {/* ─── Filter Chips (horizontally scrollable) ─── */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-8 -mx-4 px-4">
          {chips.map((chip) => (
            <button
              key={chip.label}
              onClick={() => { setTowerFilter(chip.tower); setWingFilter(chip.wing); }}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 active:scale-95 ${
                activeChipLabel === chip.label
                  ? 'bg-accent text-bg-base border-accent shadow-[0_0_12px_var(--accent-glow-strong)]'
                  : 'bg-transparent text-text-secondary border-border-subtle hover:border-text-tertiary hover:text-text-primary'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* ─── Listings ─── */}
        {isLoading ? (
          /* Skeleton loading state */
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-bg-raised rounded-2xl border border-border-subtle p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-full bg-bg-overlay" />
                  <div className="h-3 w-24 bg-bg-overlay rounded" />
                </div>
                <div className="h-8 w-20 bg-bg-overlay rounded mb-2" />
                <div className="h-3 w-40 bg-bg-overlay rounded" />
              </div>
            ))}
          </div>
        ) : filteredListings.length === 0 ? (
          /* Empty state */
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🏠↔️❓</div>
            <h3 className="text-base font-semibold text-text-secondary mb-1">No swaps here yet</h3>
            <p className="text-sm text-text-tertiary mb-6">Be the first to list your room in this block.</p>
            {user && !hasActiveListing && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="text-xs font-semibold text-accent border border-accent/30 px-4 py-2 rounded-full hover:bg-accent-glow active:scale-95 transition-all"
              >
                List a Room
              </button>
            )}
          </div>
        ) : (
          /* Card Grid */
          <div className="space-y-4">
            {filteredListings.map((listing, i) => (
              <div
                key={listing.id}
                className="card-stagger group relative bg-bg-raised border border-border-subtle rounded-2xl overflow-hidden hover:border-accent/30 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_var(--accent-glow)] active:scale-[0.99] transition-all duration-200"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                {/* Amber left accent stripe */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-accent/60 group-hover:bg-accent transition-colors" />

                <div className="pl-5 pr-4 pt-4 pb-0">
                  {/* Header: Room Number + Hostel Tag */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-2xl font-bold tracking-wide text-text-primary leading-none mb-1">
                        {listing.have_wing && (
                          <span className="inline-block bg-accent/15 text-accent text-sm font-bold px-1.5 py-0.5 rounded mr-1.5 align-middle font-mono">
                            {listing.have_wing}
                          </span>
                        )}
                        {listing.have_room}
                      </div>
                      <div className="text-xs text-text-tertiary font-medium mt-1">
                        Floor {listing.have_floor}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase bg-bg-overlay text-text-secondary px-2.5 py-1 rounded-full border border-border-subtle tracking-wider">
                      {listing.have_tower.split(' ')[0]}
                    </span>
                  </div>

                  {/* "Looking for" quote block */}
                  <div className="border-l-2 border-accent-dim/40 pl-3 mb-4">
                    <div className="text-[10px] font-semibold text-accent-dim uppercase tracking-[0.12em] mb-0.5">
                      Looking for
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {listing.want_description}
                    </p>
                  </div>

                  {/* User Row — small, bottom of card */}
                  <div className="flex items-center gap-2 pb-3">
                    <img
                      src={listing.users?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=fallback"}
                      alt="" className="w-5 h-5 rounded-full object-cover opacity-70"
                    />
                    <span className="text-xs text-text-tertiary">
                      {listing.users?.name || "Student"} · {new Date(listing.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>

                {/* Card Footer Actions */}
                {user && listing.user_id === user.id ? (
                  <button
                    onClick={() => handleResolve(listing.id)}
                    className="w-full flex items-center justify-center gap-2 bg-accent hover:brightness-110 active:scale-[0.98] text-bg-base text-sm font-semibold py-3 transition-all"
                  >
                    <Check size={16} />
                    Mark as Swapped
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(listing.whatsapp_number, { tower: listing.have_tower, wing: listing.have_wing, room: listing.have_room })}
                    className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:brightness-110 active:scale-[0.98] text-white text-sm font-semibold py-3 transition-all"
                  >
                    <MessageCircle size={16} />
                    Connect on WhatsApp
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ─── List a Room Modal ─── */}
      {isModalOpen && (
        <div className="overlay-enter fixed inset-0 z-[100] bg-bg-base/80 backdrop-blur-sm flex items-end md:items-center justify-center">
          <div className="sheet-enter md:dialog-enter bg-bg-raised border border-border-subtle w-full md:max-w-md md:rounded-2xl rounded-t-3xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
            
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 md:hidden">
              <div className="w-10 h-1 rounded-full bg-text-tertiary/40" />
            </div>

            <div className="px-5 pt-4 pb-3 flex justify-between items-center">
              <h2 className="text-base font-bold text-text-primary">List your room</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-text-tertiary hover:text-text-primary transition-colors p-1">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="px-5 pb-6 space-y-5">
              {/* HAVE Section */}
              <div className="space-y-3">
                <div className="text-[10px] font-bold text-accent uppercase tracking-[0.14em]">Room you have</div>
                
                <div className="space-y-1">
                  <label className="text-xs text-text-tertiary">Hostel</label>
                  <select
                    value={formData.tower} onChange={handleTowerChange}
                    className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                  >
                    {HOSTELS.map(h => <option key={h.name} value={h.name}>{h.name}</option>)}
                  </select>
                </div>

                <div className="flex gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-text-tertiary">Floor</label>
                    <select
                      value={formData.floor}
                      onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                      className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                    >
                      {[1, 2, 3, 4, 5, 6].map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>

                  {selectedFormHostel && selectedFormHostel.wings.length > 0 && (
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-text-tertiary">Wing</label>
                      <select
                        value={formData.wing}
                        onChange={(e) => setFormData({ ...formData, wing: e.target.value })}
                        className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                      >
                        {selectedFormHostel.wings.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-text-tertiary">Room number</label>
                  <input
                    required type="text" placeholder="e.g. 104"
                    value={formData.room} onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                    className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary font-mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                  />
                </div>
              </div>

              {/* WANT Section */}
              <div className="space-y-3">
                <div className="text-[10px] font-bold text-accent-dim uppercase tracking-[0.14em]">What you want</div>
                <div className="space-y-1">
                  <label className="text-xs text-text-tertiary">Preferences</label>
                  <textarea
                    required placeholder="e.g. 3rd floor C wing, open to D wing too..."
                    rows={2} value={formData.want} onChange={(e) => setFormData({ ...formData, want: e.target.value })}
                    className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors resize-none"
                  />
                </div>
              </div>

              {/* CONTACT Section */}
              <div className="space-y-3">
                <div className="text-[10px] font-bold text-success uppercase tracking-[0.14em]">WhatsApp</div>
                <div className="space-y-1">
                  <label className="text-xs text-text-tertiary">Number with country code</label>
                  <input
                    required type="text" placeholder="919876543210"
                    value={formData.whatsapp} onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                    className="w-full bg-bg-input border border-border-subtle rounded-xl px-4 py-3 text-sm text-text-primary font-mono focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit" disabled={isSubmitting}
                className="w-full bg-accent hover:brightness-110 active:scale-[0.97] disabled:opacity-50 disabled:cursor-wait text-bg-base font-bold py-3.5 rounded-xl transition-all shadow-[0_4px_20px_var(--accent-glow)]"
              >
                {isSubmitting ? "Posting..." : "Post Listing"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SwapBoard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <span className="font-mono text-accent text-sm animate-pulse">Loading Hxchange...</span>
      </div>
    }>
      <SwapBoardContent />
    </Suspense>
  );
}
