import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Shield } from "lucide-react";
import Sidebar from "./sidebar";
import { useLocation } from "wouter";
import * as React from "react";

interface MobileHeaderProps {
  unreadCount?: number;
}

export default function MobileHeader({ unreadCount = 0 }: MobileHeaderProps) {
  const [location] = useLocation();
  const [open, setOpen] = React.useState(false);
  
  const getPageTitle = () => {
    switch (location) {
      case "/inbox": return "Inbox";
      case "/sent": return "Sent";
      case "/compose": return "Compose";
      case "/keys": return "Key Dashboard";
      case "/settings": return "Settings";
      case "/audit": return "Security Audit";
      default: return "QuMail";
    }
  };

  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border sticky top-0 z-50">
      <div className="flex items-center space-x-2">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 border-r-0 bg-transparent">
            {/* We force the sidebar to be visible inside the sheet by overriding hidden class */}
            <div className="flex w-72 h-full bg-card overflow-hidden">
              <Sidebar 
                unreadCount={unreadCount} 
                isMobile 
                onNavigate={() => setOpen(false)} 
              />
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-primary to-purple-600 rounded-lg flex items-center justify-center shadow-md">
            <Shield className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight">{getPageTitle()}</span>
        </div>
      </div>
      
      {/* Small placeholder for right side actions if needed */}
      <div className="w-9 h-9" />
    </div>
  );
}
