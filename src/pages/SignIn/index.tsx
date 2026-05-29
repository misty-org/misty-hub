import { useSetupStore } from "../../store/useSetupStore";
import WebsiteSignIn from "@website/pages/SignIn";

export default function SignIn() {
  const { saveAuthenticatedUser } = useSetupStore();

  return <WebsiteSignIn onSignedIn={saveAuthenticatedUser} />;
}
