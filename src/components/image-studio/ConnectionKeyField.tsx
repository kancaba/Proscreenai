import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useId, useState } from "react";

export function ConnectionKeyField({
	label,
	value,
	onChange,
	disabled,
	placeholder,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	disabled: boolean;
	placeholder: string;
}) {
	const id = useId(),
		[visible, setVisible] = useState(false);
	return (
		<div className="connection-key-field">
			<label htmlFor={id}>{label}</label>
			<div className="connection-key-input">
				<KeyRound size={16} aria-hidden="true" />
				<input
					id={id}
					type={visible ? "text" : "password"}
					aria-label={label}
					autoComplete="off"
					spellCheck={false}
					value={value}
					disabled={disabled}
					placeholder={placeholder}
					onChange={(e) => onChange(e.target.value)}
				/>
				<button
					type="button"
					className="connection-reveal"
					aria-label={visible ? "Anahtarı gizle" : "Anahtarı göster"}
					aria-pressed={visible}
					disabled={disabled}
					onClick={() => setVisible((v) => !v)}
				>
					{visible ? <EyeOff size={16} /> : <Eye size={16} />}
				</button>
			</div>
		</div>
	);
}
