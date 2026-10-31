import { avatarColor, initials } from '../utils.js';

export function Avatar({ name, size = 40 }) {
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, background: avatarColor(name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
