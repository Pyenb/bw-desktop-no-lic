import { CommonModule } from "@angular/common";
import { Component, Input, OnInit } from "@angular/core";
import { ReactiveFormsModule, FormsModule, FormControl } from "@angular/forms";

import { JslibModule } from "@bitwarden/angular/jslib.module";
import { LoginStrategyServiceAbstraction } from "@bitwarden/auth/common";
import { ApiService } from "@bitwarden/common/abstractions/api.service";
import { TwoFactorService } from "@bitwarden/common/auth/abstractions/two-factor.service";
import { TwoFactorProviderType } from "@bitwarden/common/auth/enums/two-factor-provider-type";
import { TwoFactorEmailRequest } from "@bitwarden/common/auth/models/request/two-factor-email.request";
import { AppIdService } from "@bitwarden/common/platform/abstractions/app-id.service";
import { I18nService } from "@bitwarden/common/platform/abstractions/i18n.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { PlatformUtilsService } from "@bitwarden/common/platform/abstractions/platform-utils.service";
import {
  DialogModule,
  ButtonModule,
  LinkModule,
  TypographyModule,
  FormFieldModule,
  AsyncActionsModule,
  ToastService,
} from "@bitwarden/components";

import { TwoFactorAuthEmailComponentService } from "./two-factor-auth-email-component.service";

@Component({
  standalone: true,
  selector: "app-two-factor-auth-email",
  templateUrl: "two-factor-auth-email.component.html",
  imports: [
    CommonModule,
    JslibModule,
    DialogModule,
    ButtonModule,
    LinkModule,
    TypographyModule,
    ReactiveFormsModule,
    FormFieldModule,
    AsyncActionsModule,
    FormsModule,
  ],
  providers: [],
})
export class TwoFactorAuthEmailComponent implements OnInit {
  @Input({ required: true }) tokenFormControl: FormControl | undefined = undefined;

  twoFactorEmail: string | undefined = undefined;
  emailPromise: Promise<any> | undefined = undefined;
  tokenValue: string = "";

  constructor(
    protected i18nService: I18nService,
    protected twoFactorService: TwoFactorService,
    protected loginStrategyService: LoginStrategyServiceAbstraction,
    protected platformUtilsService: PlatformUtilsService,
    protected logService: LogService,
    protected apiService: ApiService,
    protected appIdService: AppIdService,
    private toastService: ToastService,
    private twoFactorAuthEmailComponentService: TwoFactorAuthEmailComponentService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.twoFactorAuthEmailComponentService.openPopoutIfApprovedForEmail2fa?.();

    const providers = await this.twoFactorService.getProviders();

    if (!providers) {
      throw new Error("User has no 2FA Providers");
    }

    const email2faProviderData = providers.get(TwoFactorProviderType.Email);

    if (!email2faProviderData) {
      throw new Error("Unable to retrieve email 2FA provider data");
    }

    this.twoFactorEmail = email2faProviderData.Email;

    if (providers.size > 1) {
      await this.sendEmail(false);
    }
  }

  async sendEmail(doToast: boolean) {
    if (this.emailPromise !== undefined) {
      return;
    }

    // TODO: PM-17545 - consider building a method on the login strategy service to get a mostly
    // initialized TwoFactorEmailRequest in 1 call instead of 5 like we do today.
    const email = await this.loginStrategyService.getEmail();

    if (email == null) {
      this.toastService.showToast({
        variant: "error",
        title: this.i18nService.t("errorOccurred"),
        message: this.i18nService.t("sessionTimeout"),
      });
      return;
    }

    try {
      const request = new TwoFactorEmailRequest();
      request.email = email;

      request.masterPasswordHash = (await this.loginStrategyService.getMasterPasswordHash()) ?? "";
      request.ssoEmail2FaSessionToken =
        (await this.loginStrategyService.getSsoEmail2FaSessionToken()) ?? "";
      request.deviceIdentifier = await this.appIdService.getAppId();
      request.authRequestAccessCode = (await this.loginStrategyService.getAccessCode()) ?? "";
      request.authRequestId = (await this.loginStrategyService.getAuthRequestId()) ?? "";
      this.emailPromise = this.apiService.postTwoFactorEmail(request);
      await this.emailPromise;
      if (doToast) {
        this.toastService.showToast({
          variant: "success",
          title: "",
          message: this.i18nService.t("verificationCodeEmailSent", this.twoFactorEmail),
        });
      }
    } catch (e) {
      this.logService.error(e);
    }

    this.emailPromise = undefined;
  }
}
