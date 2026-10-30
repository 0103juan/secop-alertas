from django.core.management.base import BaseCommand

from alerts.delivery import deliver_pending


class Command(BaseCommand):
    help = "Sends alerts that are due: new ones nobody sent yet and failed ones whose backoff has passed."

    def handle(self, *args, **options):
        self.stdout.write(f"delivered={deliver_pending()}")
