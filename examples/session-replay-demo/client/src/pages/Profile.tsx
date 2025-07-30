import { useState } from 'react';
import lumberjack from '../lib/lumberjack';

function Profile() {
  const [formData, setFormData] = useState({
    name: 'Demo User',
    email: 'demo@example.com',
    bio: '',
    notifications: true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    lumberjack.track('profile_updated', {
      fields_changed: Object.keys(formData),
      notifications_enabled: formData.notifications,
    });

    alert('Profile updated successfully!');
  };

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account?')) {
      lumberjack.track('account_deletion_attempted', {
        confirmed: true,
      });
      
      // Simulate an error during deletion
      try {
        throw new Error('Account deletion is disabled in demo mode');
      } catch (error) {
        lumberjack.captureError(error as Error, {
          context: 'account_deletion',
          user_action: 'delete_account',
        });
        alert('Account deletion failed - this is a demo!');
      }
    } else {
      lumberjack.track('account_deletion_attempted', {
        confirmed: false,
      });
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1>Profile</h1>
      </div>

      <div className="card">
        <h2>User Settings</h2>
        <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
              Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
              Bio
            </label>
            <textarea
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              placeholder="Tell us about yourself..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px',
                resize: 'vertical',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="checkbox"
                checked={formData.notifications}
                onChange={(e) => setFormData({ ...formData, notifications: e.target.checked })}
                style={{ width: '20px', height: '20px' }}
              />
              <span style={{ fontWeight: '600' }}>Enable email notifications</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="btn btn-success">
              Save Changes
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => {
              setFormData({
                name: 'Demo User',
                email: 'demo@example.com',
                bio: '',
                notifications: true,
              });
            }}>
              Reset
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <h2>Privacy Settings</h2>
        <div className="lumberjack-block" style={{ 
          padding: '20px', 
          background: '#f8f9fa', 
          borderRadius: '4px',
          marginTop: '15px' 
        }}>
          <p style={{ marginBottom: '10px' }}>
            This section is marked with the <code>.lumberjack-block</code> class 
            and will not appear in session replays.
          </p>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: '600' }}>
            Secret API Key
          </label>
          <input
            type="password"
            defaultValue="super-secret-key-123"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '16px',
            }}
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        <h2>Danger Zone</h2>
        <p style={{ marginBottom: '15px', color: '#666' }}>
          Irreversible actions - proceed with caution!
        </p>
        <button className="btn btn-danger" onClick={handleDeleteAccount}>
          Delete Account
        </button>
      </div>
    </div>
  );
}

export default Profile;