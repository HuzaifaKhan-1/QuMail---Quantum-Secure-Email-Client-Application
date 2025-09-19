import { Badge } from "@/components/ui/badge";
import { Shield, Key, Lock, Mail } from "lucide-react";
import { SecurityLevel } from "@/lib/types";

interface SecurityBadgeProps {
  level: SecurityLevel;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

export default function SecurityBadge({ level, size = "md", showIcon = true }: SecurityBadgeProps) {
  const getSecurityConfig = (level: SecurityLevel) => {
    switch (level) {
      case SecurityLevel.LEVEL1_OTP:
        return {
          label: "Level 1 OTP",
          description: "One-Time Pad",
          color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
          icon: Shield
        };
      case SecurityLevel.LEVEL2_AES:
        return {
          label: "Level 2 AES", 
          description: "Quantum-seeded AES",
          color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
          icon: Key
        };
      case SecurityLevel.LEVEL3_PQC:
        return {
          label: "Level 3 PQC",
          description: "Post-Quantum Cryptography",
          color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
          icon: Lock
        };
      case SecurityLevel.LEVEL4_PLAIN:
        return {
          label: "Plain Text",
          description: "No encryption",
          color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
          icon: Mail
        };
      default:
        return {
          label: "Unknown",
          description: "Unknown security level",
          color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
          icon: Mail
        };
    }
  };

  const config = getSecurityConfig(level);
  const Icon = config.icon;

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5",
    md: "text-sm px-2 py-1", 
    lg: "text-base px-3 py-1.5"
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5"
  };

  return (
    <Badge 
      className={`${config.color} ${sizeClasses[size]} inline-flex items-center space-x-1 border-0`}
      data-testid={`badge-security-${level}`}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      <span>{config.label}</span>
    </Badge>
  );
}
