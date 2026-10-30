from django.urls import path

from .views import OutliersView, SplittingView

urlpatterns = [
    path("analytics/splitting/", SplittingView.as_view(), name="splitting"),
    path("analytics/outliers/", OutliersView.as_view(), name="outliers"),
]
